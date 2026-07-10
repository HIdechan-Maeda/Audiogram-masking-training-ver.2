import React, { useCallback, useEffect, useRef, useState } from 'react';
import CameraPipOverlay, { computeBottomRightLayout, DEFAULT_PIP_LAYOUT } from './CameraPipOverlay';
import RecordingPreviewModal from './RecordingPreviewModal';
import {
  attachCameraToVideo,
  detachCameraFromVideo,
  downloadRecordingBlob,
  requestCameraStream,
  startCameraRecording,
  stopMediaStream,
  waitForVideoFrame,
} from './simulatorRecording';

const MODES = {
  OKN: 'okn',
  PURSUIT: 'pursuit',
  SACCADE: 'saccade',
  GAZE: 'gaze',
};

const MODE_INFO = {
  [MODES.OKN]: {
    title: 'OKN（視運動眼震）',
    subtitle: 'Optokinetic Nystagmus',
    description:
      '視野内のパターンが動くと、眼球は追従運動（徐波相）のあと反対方向へ素早く戻ります（速波相）。前庭機能検査の補助や視覚系の評価で用いられます。',
  },
  [MODES.PURSUIT]: {
    title: 'ETT（滑動性追跡）',
    subtitle: 'Smooth Pursuit Tracking',
    description:
      '動く標的を滑らかに追う眼球運動です。小脳・脳幹・視覚経路の協調が必要で、追従の遅れや不規則さは病変の手がかりになります。',
  },
  [MODES.SACCADE]: {
    title: 'Saccade（跳躍性眼球運動）',
    subtitle: 'Saccadic Eye Movement',
    description:
      '注視点を素早く別の位置へ飛ばす運動です。正中・外側への跳躍、潜伏期、オーバーシュートなどを観察します。',
  },
  [MODES.GAZE]: {
    title: 'Gaze Test（注視眼振）',
    subtitle: 'Gaze-Evoked Nystagmus',
    description:
      '正中・左右・上下への偏心注視時の眼球安定性を観察します。標的が右→正中→左→正中→上→正中→下→正中の順に跳躍し、偏心位置で10秒・正中で5秒静止します。',
  },
};

const DEFAULT_W = 820;
const DEFAULT_H = 360;

const DEFAULT_VIEW_DISTANCE_CM = 50;
const DEFAULT_SCREEN_WIDTH_CM = 34;
const OKN_DEG_MIN = 2;
const OKN_DEG_MAX = 60;
const PURSUIT_AMP_DEG_MIN = 5;
const PURSUIT_AMP_DEG_MAX = 15;
const PURSUIT_AMP_DEG_DEFAULT = 15;
const PURSUIT_HZ_DEFAULT = 0.25;
const GAZE_ECCENTRIC_DEG_DEFAULT = 15;
const GAZE_HOLD_SEC = 10;
const GAZE_CENTER_HOLD_SEC = 5;

function buildGazeSequence(eccentricDeg) {
  const d = eccentricDeg;
  const center = { degX: 0, degY: 0, label: '正中', holdSec: GAZE_CENTER_HOLD_SEC };
  return [
    { degX: d, degY: 0, label: `右 ${d}°`, holdSec: GAZE_HOLD_SEC },
    center,
    { degX: -d, degY: 0, label: `左 ${d}°`, holdSec: GAZE_HOLD_SEC },
    center,
    { degX: 0, degY: d, label: `上 ${d}°`, holdSec: GAZE_HOLD_SEC },
    center,
    { degX: 0, degY: -d, label: `下 ${d}°`, holdSec: GAZE_HOLD_SEC },
    center,
  ];
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

/** 小角度近似: 画面上の横移動(px/s) → 視角速度(°/s) */
function getDegPerPixel(stageWidthPx, viewDistanceCm, screenWidthCm) {
  if (typeof window === 'undefined' || stageWidthPx <= 0) return 0.02;
  const screenPx = window.screen.width || 1920;
  const visibleWidthCm = screenWidthCm * (stageWidthPx / screenPx);
  const cmPerPx = visibleWidthCm / stageWidthPx;
  return (cmPerPx / viewDistanceCm) * (180 / Math.PI);
}

function pxPerSecToDegPerSec(pxPerSec, stageWidthPx, viewDistanceCm, screenWidthCm) {
  return pxPerSec * getDegPerPixel(stageWidthPx, viewDistanceCm, screenWidthCm);
}

function degPerSecToPxPerSec(degPerSec, stageWidthPx, viewDistanceCm, screenWidthCm) {
  const degPerPx = getDegPerPixel(stageWidthPx, viewDistanceCm, screenWidthCm);
  return degPerPx > 0 ? degPerSec / degPerPx : degPerSec * 50;
}

function normToDeg(norm, stageWidthPx, viewDistanceCm, screenWidthCm) {
  const px = norm * stageWidthPx * 0.38;
  return px * getDegPerPixel(stageWidthPx, viewDistanceCm, screenWidthCm);
}

function degOffsetToPx(deg, stageWidthPx, viewDistanceCm, screenWidthCm) {
  const degPerPx = getDegPerPixel(stageWidthPx, viewDistanceCm, screenWidthCm);
  return degPerPx > 0 ? deg / degPerPx : deg * 50;
}

function getScreenHeightCm(screenWidthCm) {
  if (typeof window === 'undefined') return screenWidthCm * 0.56;
  const sw = window.screen.width || 1920;
  const sh = window.screen.height || 1080;
  return screenWidthCm * (sh / sw);
}

function getDegPerPixelVertical(stageHeightPx, viewDistanceCm, screenHeightCm) {
  const screenPxH = typeof window !== 'undefined' ? window.screen.height : 1080;
  const visibleHeightCm = screenHeightCm * (stageHeightPx / screenPxH);
  const cmPerPx = visibleHeightCm / Math.max(1, stageHeightPx);
  return (cmPerPx / viewDistanceCm) * (180 / Math.PI);
}

/** Gaze用: 上部バー・操作パネル・眼球表示を除いた注視可能領域 */
function getGazeViewport(layout, isFullscreen, panelOpen) {
  const { w, h } = layout;
  const topMargin = isFullscreen ? 96 : 44;
  const bottomMargin = panelOpen
    ? Math.min(h * 0.28, 260)
    : isFullscreen
      ? 64
      : Math.min(h * 0.28, 120);
  const usableH = Math.max(140, h - topMargin - bottomMargin);
  const maxOffsetX = w / 2 - 48;
  const maxOffsetY = usableH / 2 - 20;
  return {
    centerX: w / 2,
    centerY: topMargin + usableH / 2,
    maxOffsetX,
    maxOffsetY,
    topMargin,
    usableH,
  };
}

function getGazeTargetPx(degX, degY, layout, viewDistanceCm, screenWidthCm, viewport) {
  const { w } = layout;
  const { centerX, centerY, maxOffsetX, maxOffsetY } = viewport;
  const screenHeightCm = getScreenHeightCm(screenWidthCm);
  const degPerPxH = getDegPerPixel(w, viewDistanceCm, screenWidthCm);
  const degPerPxV = getDegPerPixelVertical(layout.h, viewDistanceCm, screenHeightCm);
  const offsetX = clamp(degPerPxH > 0 ? degX / degPerPxH : degX * 50, -maxOffsetX, maxOffsetX);
  const offsetY = clamp(degPerPxV > 0 ? degY / degPerPxV : degY * 50, -maxOffsetY, maxOffsetY);
  return {
    xPx: centerX + offsetX,
    yPx: centerY - offsetY,
    degX: offsetX * degPerPxH,
    degY: offsetY * degPerPxV,
    viewport,
  };
}

function gazePxToNorm(xPx, yPx, viewport, layout) {
  const { w } = layout;
  const { centerX, centerY } = viewport;
  const scale = w * 0.38;
  return {
    normX: (xPx - centerX) / scale,
    normY: (yPx - centerY) / scale,
  };
}

/** ETT: 設定振幅(°)が画面内に収まるよう px 振幅を決定（sin 波形は維持） */
function resolvePursuitPxAmplitude(ampDeg, stageWidthPx, viewDistanceCm, screenWidthCm, marginPx = 40) {
  const maxOffsetPx = Math.max(1, stageWidthPx / 2 - marginPx);
  let effectiveViewCm = viewDistanceCm;
  let degPerPx = getDegPerPixel(stageWidthPx, effectiveViewCm, screenWidthCm);
  let pxAmp = degPerPx > 0 ? ampDeg / degPerPx : ampDeg * 50;

  if (pxAmp > maxOffsetPx && ampDeg > 0) {
    const scale = maxOffsetPx / pxAmp;
    effectiveViewCm = viewDistanceCm / scale;
    degPerPx = getDegPerPixel(stageWidthPx, effectiveViewCm, screenWidthCm);
    pxAmp = degPerPx > 0 ? ampDeg / degPerPx : maxOffsetPx;
  }

  return { pxAmp: clamp(pxAmp, 0, maxOffsetPx), effectiveViewCm };
}

/** 標的位置: θ(t) = A·sin(2πft) [°] を画面座標へ変換 */
function getPursuitTarget(elapsed, hz, ampDeg, stageWidthPx, viewDistanceCm, screenWidthCm, running) {
  const centerPx = stageWidthPx / 2;
  if (!running || ampDeg <= 0) {
    return { sinVal: 0, targetDeg: 0, xPx: centerPx, targetNorm: 0 };
  }
  const sinVal = Math.sin(elapsed * Math.PI * 2 * hz);
  const amp = clamp(ampDeg, PURSUIT_AMP_DEG_MIN, PURSUIT_AMP_DEG_MAX);
  const { pxAmp } = resolvePursuitPxAmplitude(amp, stageWidthPx, viewDistanceCm, screenWidthCm);
  const xPx = centerPx + sinVal * pxAmp;
  const targetDeg = sinVal * amp;
  const targetNorm = (xPx - centerPx) / (stageWidthPx * 0.38);
  return { sinVal, targetDeg, xPx, targetNorm };
}

function drawPursuitSineGuide(ctx, elapsed, hz, ampDeg, layout, viewDistanceCm, screenWidthCm) {
  const { w, targetY } = layout;
  const { pxAmp } = resolvePursuitPxAmplitude(ampDeg, w, viewDistanceCm, screenWidthCm);
  const centerX = w / 2;
  const samples = 96;
  const spanSec = Math.max(1 / hz, 0.5);

  ctx.save();
  ctx.strokeStyle = 'rgba(100, 116, 139, 0.4)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 7]);
  ctx.beginPath();
  for (let i = 0; i <= samples; i += 1) {
    const t = elapsed - spanSec + (i / samples) * spanSec * 2;
    const x = centerX + Math.sin(t * Math.PI * 2 * hz) * pxAmp;
    if (i === 0) ctx.moveTo(x, targetY);
    else ctx.lineTo(x, targetY);
  }
  ctx.stroke();
  ctx.restore();
}


function makeLayout(w, h) {
  return {
    w,
    h,
    eyeY: h * 0.62,
    eyeRadius: clamp(w * 0.044, 26, 52),
    stimH: h * 0.48,
    targetY: h * 0.22,
  };
}

function normToPx(n, layout) {
  return layout.w / 2 + n * (layout.w * 0.38);
}

function pxToNorm(px, layout) {
  return (px - layout.w / 2) / (layout.w * 0.38);
}

function drawEye(ctx, xPx, layout, label, yOffsetPx = 0) {
  const { w, eyeY, eyeRadius } = layout;
  const y = eyeY + yOffsetPx;
  const x = clamp(xPx, eyeRadius + 24, w - eyeRadius - 24);

  ctx.save();
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(w / 2, y - eyeRadius - 34);
  ctx.lineTo(x, y - eyeRadius - 8);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(x, y, eyeRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  const irisR = eyeRadius * 0.4;
  ctx.fillStyle = '#60a5fa';
  ctx.beginPath();
  ctx.arc(x, y, irisR, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.arc(x, y, irisR * 0.45, 0, Math.PI * 2);
  ctx.fill();

  if (label) {
    ctx.fillStyle = '#475569';
    ctx.font = `${Math.max(11, eyeRadius * 0.32)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(label, x, y + eyeRadius + 18);
  }
  ctx.restore();
  return x;
}

function drawTarget(ctx, xPx, layout, color = '#ef4444', { clampX = true } = {}) {
  const { w, targetY } = layout;
  const x = clampX ? clamp(xPx, 40, w - 40) : xPx;
  const r = clamp(layout.w * 0.012, 8, 14);
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, targetY, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  return x;
}

function drawFixationCross(ctx, xPx, yPx, layout, bounds = null) {
  const { w, h } = layout;
  const yMin = bounds ? bounds.topMargin + 12 : 24;
  const yMax = bounds ? bounds.topMargin + bounds.usableH - 12 : h;
  const x = clamp(xPx, 40, w - 40);
  const y = clamp(yPx, yMin, yMax);
  const s = clamp(layout.w * 0.015, 10, 18);
  ctx.save();
  ctx.strokeStyle = '#22c55e';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(x - s, y);
  ctx.lineTo(x + s, y);
  ctx.moveTo(x, y - s);
  ctx.lineTo(x, y + s);
  ctx.stroke();
  ctx.restore();
  return x;
}

function drawOknStripes(ctx, offset, direction, layout, degPerSec) {
  const { w, stimH } = layout;
  const stripeW = clamp(w * 0.054, 36, 64);
  const start = -stripeW * 2 + (offset % (stripeW * 2));
  ctx.save();
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, w, stimH);
  for (let x = start; x < w + stripeW * 2; x += stripeW) {
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(x, 0, stripeW / 2, stimH);
  }
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fillRect(0, 0, w, stimH);
  ctx.fillStyle = '#e2e8f0';
  ctx.font = `${Math.max(12, w * 0.016)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  const dirLabel = direction > 0 ? 'パターン → 右方向移動' : 'パターン ← 左方向移動';
  ctx.fillText(dirLabel, w / 2, Math.max(20, stimH * 0.08));
  if (degPerSec > 0) {
    ctx.fillStyle = '#cbd5e1';
    ctx.font = `${Math.max(11, w * 0.014)}px system-ui, sans-serif`;
    ctx.fillText(`刺激速度 約 ${degPerSec.toFixed(0)} °/s`, w / 2, Math.max(38, stimH * 0.16));
  }
  ctx.restore();
}

function ModeControls({
  mode,
  oknDegPerSec,
  setOknDegPerSec,
  viewDistanceCm,
  setViewDistanceCm,
  screenWidthCm,
  setScreenWidthCm,
  oknDir,
  setOknDir,
  pursuitHz,
  setPursuitHz,
  pursuitAmpDeg,
  setPursuitAmpDeg,
  gazeEccentricDeg,
  setGazeEccentricDeg,
  gazePathology,
  setGazePathology,
  stateRef,
  compact = false,
}) {
  return (
    <div className={compact ? 'space-y-2' : ''}>
      {mode === MODES.OKN && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-4 items-end">
            <label className="text-sm">
              <span className="block text-gray-600 mb-1">刺激速度（視角速度）</span>
              <input
                type="range"
                min={OKN_DEG_MIN}
                max={OKN_DEG_MAX}
                step={1}
                value={oknDegPerSec}
                onChange={(e) => setOknDegPerSec(Number(e.target.value))}
                className={compact ? 'w-36' : 'w-48'}
              />
              <span className="ml-2 text-gray-900 font-semibold">{oknDegPerSec} °/s</span>
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setOknDir(-1)}
                className={`px-3 py-1.5 rounded border text-sm ${oknDir < 0 ? 'bg-indigo-100 border-indigo-400' : 'bg-white'}`}
              >
                ← 左へ
              </button>
              <button
                type="button"
                onClick={() => setOknDir(1)}
                className={`px-3 py-1.5 rounded border text-sm ${oknDir > 0 ? 'bg-indigo-100 border-indigo-400' : 'bg-white'}`}
              >
                右へ →
              </button>
            </div>
          </div>
          <p className="text-xs text-gray-500 leading-relaxed">
            PC画面を<strong>約{viewDistanceCm}cm</strong>の距離から見たとき、1秒間に視野角が何度動くか（°/s）で表示しています。
            臨床の視運動刺激ではおおよそ<strong>20〜40°/s</strong>がよく使われます。
          </p>
          <div className="flex flex-wrap gap-4 text-sm">
            <label>
              <span className="block text-gray-600 mb-1 text-xs">視距離 (cm)</span>
              <input
                type="number"
                min={30}
                max={80}
                step={5}
                value={viewDistanceCm}
                onChange={(e) => setViewDistanceCm(Number(e.target.value) || DEFAULT_VIEW_DISTANCE_CM)}
                className="w-20 px-2 py-1 border rounded"
              />
            </label>
            <label>
              <span className="block text-gray-600 mb-1 text-xs">画面幅 (cm)</span>
              <input
                type="number"
                min={25}
                max={60}
                step={1}
                value={screenWidthCm}
                onChange={(e) => setScreenWidthCm(Number(e.target.value) || DEFAULT_SCREEN_WIDTH_CM)}
                className="w-20 px-2 py-1 border rounded"
              />
            </label>
          </div>
        </div>
      )}

      {mode === MODES.PURSUIT && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-4 items-end">
            <label className="text-sm">
              <span className="block text-gray-600 mb-1">標的の振幅（視角）</span>
              <input
                type="range"
                min={PURSUIT_AMP_DEG_MIN}
                max={PURSUIT_AMP_DEG_MAX}
                step={5}
                value={pursuitAmpDeg}
                onChange={(e) => setPursuitAmpDeg(Number(e.target.value))}
                className={compact ? 'w-36' : 'w-48'}
              />
              <span className="ml-2 text-gray-900 font-semibold">±{pursuitAmpDeg}°</span>
            </label>
            <div className="flex gap-2">
              {[5, 10, 15].map((deg) => (
                <button
                  key={deg}
                  type="button"
                  onClick={() => setPursuitAmpDeg(deg)}
                  className={`px-3 py-1.5 rounded border text-sm ${
                    pursuitAmpDeg === deg ? 'bg-indigo-100 border-indigo-400' : 'bg-white'
                  }`}
                >
                  ±{deg}°
                </button>
              ))}
            </div>
            <label className="text-sm">
              <span className="block text-gray-600 mb-1">周波数 (Hz)</span>
              <input
                type="range"
                min={0.15}
                max={0.8}
                step={0.05}
                value={pursuitHz}
                onChange={(e) => setPursuitHz(Number(e.target.value))}
                className={compact ? 'w-32' : 'w-40'}
              />
              <span className="ml-2">{pursuitHz.toFixed(2)}</span>
            </label>
          </div>
          <p className="text-xs text-gray-500 leading-relaxed">
            標的は<strong>正弦波（sin）</strong>で正中を中心に左右へ動きます（θ = A·sin(2πft)）。
            視距離<strong>約{viewDistanceCm}cm</strong>から見た偏心視角で振幅を設定します（13〜15インチPC・フルスクリーン想定で最大<strong>±15°</strong>）。
          </p>
          <div className="flex flex-wrap gap-4 text-sm">
            <label>
              <span className="block text-gray-600 mb-1 text-xs">視距離 (cm)</span>
              <input
                type="number"
                min={30}
                max={80}
                step={5}
                value={viewDistanceCm}
                onChange={(e) => setViewDistanceCm(Number(e.target.value) || DEFAULT_VIEW_DISTANCE_CM)}
                className="w-20 px-2 py-1 border rounded"
              />
            </label>
            <label>
              <span className="block text-gray-600 mb-1 text-xs">画面幅 (cm)</span>
              <input
                type="number"
                min={25}
                max={60}
                step={1}
                value={screenWidthCm}
                onChange={(e) => setScreenWidthCm(Number(e.target.value) || DEFAULT_SCREEN_WIDTH_CM)}
                className="w-20 px-2 py-1 border rounded"
              />
            </label>
          </div>
        </div>
      )}

      {mode === MODES.SACCADE && (
        <p className="text-sm text-gray-600">
          標的が正中 → 右 → 左 → 正中の順に跳躍します。眼球は素早く標的位置へ移動します。
        </p>
      )}

      {mode === MODES.GAZE && (
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            開始すると標的が <strong>右 → 正中 → 左 → 正中 → 上 → 正中 → 下 → 正中</strong> の順に跳躍します。
            偏心位置では <strong>{GAZE_HOLD_SEC}秒</strong>、正中に戻ったときは <strong>{GAZE_CENTER_HOLD_SEC}秒</strong>静止します。
          </p>
          <label className="text-sm">
            <span className="block text-gray-600 mb-1">偏心角度（視角）</span>
            <input
              type="range"
              min={5}
              max={PURSUIT_AMP_DEG_MAX}
              step={5}
              value={gazeEccentricDeg}
              onChange={(e) => setGazeEccentricDeg(Number(e.target.value))}
              className={compact ? 'w-36' : 'w-48'}
            />
            <span className="ml-2 text-gray-900 font-semibold">±{gazeEccentricDeg}°</span>
          </label>
          <p className="text-xs text-gray-500 leading-relaxed">
            視距離<strong>約{viewDistanceCm}cm</strong>から見た偏心視角です（13〜15インチPC・フルスクリーン想定で最大<strong>±15°</strong>）。
            上下の角度を左右と揃えるため、注視領域は操作パネル・眼球表示を除いた範囲を使います（パネルを閉じると上下の可動域が広がります）。
          </p>
          <div className="flex flex-wrap gap-4 text-sm">
            <label>
              <span className="block text-gray-600 mb-1 text-xs">視距離 (cm)</span>
              <input
                type="number"
                min={30}
                max={80}
                step={5}
                value={viewDistanceCm}
                onChange={(e) => setViewDistanceCm(Number(e.target.value) || DEFAULT_VIEW_DISTANCE_CM)}
                className="w-20 px-2 py-1 border rounded"
              />
            </label>
            <label>
              <span className="block text-gray-600 mb-1 text-xs">画面幅 (cm)</span>
              <input
                type="number"
                min={25}
                max={60}
                step={1}
                value={screenWidthCm}
                onChange={(e) => setScreenWidthCm(Number(e.target.value) || DEFAULT_SCREEN_WIDTH_CM)}
                className="w-20 px-2 py-1 border rounded"
              />
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={gazePathology}
              onChange={(e) => {
                setGazePathology(e.target.checked);
                stateRef.current.gazePathology = e.target.checked;
              }}
            />
            <span>注視誘発眼振をシミュレート（偏心注視時に眼振を表示）</span>
          </label>
        </div>
      )}
    </div>
  );
}

export default function EyeMovementSimulator() {
  const stageRef = useRef(null);
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const layoutRef = useRef(makeLayout(DEFAULT_W, DEFAULT_H));
  const stateRef = useRef({
    mode: MODES.OKN,
    running: false,
    t0: 0,
    lastTs: 0,
    eyeNorm: 0,
    oknPhase: 'slow',
    oknDir: 1,
    oknDegPerSec: 25,
    viewDistanceCm: DEFAULT_VIEW_DISTANCE_CM,
    screenWidthCm: DEFAULT_SCREEN_WIDTH_CM,
    pursuitAmpDeg: PURSUIT_AMP_DEG_DEFAULT,
    pursuitHz: PURSUIT_HZ_DEFAULT,
    pursuitLag: 0.08,
    saccadeTargets: [-0.75, 0, 0.75, 0],
    saccadeIndex: 0,
    saccadeNextAt: 0,
    gazeEccentricDeg: GAZE_ECCENTRIC_DEG_DEFAULT,
    gazeIndex: 0,
    gazeHoldUntil: 0,
    eyeNormY: 0,
    gazePathology: false,
    gazeNystPhase: 0,
  });

  const [mode, setMode] = useState(MODES.OKN);
  const [running, setRunning] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);
  const [oknDegPerSec, setOknDegPerSec] = useState(25);
  const [viewDistanceCm, setViewDistanceCm] = useState(DEFAULT_VIEW_DISTANCE_CM);
  const [screenWidthCm, setScreenWidthCm] = useState(DEFAULT_SCREEN_WIDTH_CM);
  const [oknDir, setOknDir] = useState(1);
  const [pursuitHz, setPursuitHz] = useState(PURSUIT_HZ_DEFAULT);
  const [pursuitAmpDeg, setPursuitAmpDeg] = useState(PURSUIT_AMP_DEG_DEFAULT);
  const [gazeEccentricDeg, setGazeEccentricDeg] = useState(GAZE_ECCENTRIC_DEG_DEFAULT);
  const [gazePathology, setGazePathology] = useState(false);
  const [phaseLabel, setPhaseLabel] = useState('—');
  const phaseLabelRef = useRef('—');
  const videoRef = useRef(null);
  const cameraStreamRef = useRef(null);
  const recordingSessionRef = useRef(null);
  const pipLayoutRef = useRef(DEFAULT_PIP_LAYOUT);
  const previewBlobRef = useRef(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingBusy, setRecordingBusy] = useState(false);
  const [pipLayout, setPipLayout] = useState(DEFAULT_PIP_LAYOUT);
  const [recordingPreviewUrl, setRecordingPreviewUrl] = useState(null);
  const [recordingPreviewMime, setRecordingPreviewMime] = useState('');

  const updatePhaseLabel = useCallback((label) => {
    if (phaseLabelRef.current !== label) {
      phaseLabelRef.current = label;
      setPhaseLabel(label);
    }
  }, []);

  const handlePipLayoutChange = useCallback((next) => {
    pipLayoutRef.current = next;
    setPipLayout(next);
  }, []);

  const closeRecordingPreview = useCallback(() => {
    setRecordingPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    previewBlobRef.current = null;
    setRecordingPreviewMime('');
  }, []);

  const downloadRecordingPreview = useCallback(() => {
    if (previewBlobRef.current) downloadRecordingBlob(previewBlobRef.current);
  }, []);

  const resizeCanvas = useCallback(() => {
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    if (!stage || !canvas) return;
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    if (w <= 0 || h <= 0) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    layoutRef.current = makeLayout(w, h);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const el = stageRef.current;
    if (!el) return;
    try {
      if (!document.fullscreenElement) {
        await el.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (e) {
      console.warn('フルスクリーン切替に失敗:', e);
    }
  }, []);

  const enableCamera = useCallback(async () => {
    setCameraError('');
    try {
      stopMediaStream(cameraStreamRef.current);
      detachCameraFromVideo(videoRef.current);
      const stream = await requestCameraStream();
      cameraStreamRef.current = stream;
      setCameraOn(true);
    } catch (e) {
      setCameraOn(false);
      setCameraError(e?.message || 'カメラを起動できませんでした。ブラウザの許可を確認してください。');
    }
  }, []);

  useEffect(() => {
    if (!cameraOn || !cameraStreamRef.current) return undefined;
    let cancelled = false;
    (async () => {
      try {
        await attachCameraToVideo(cameraStreamRef.current, videoRef.current);
      } catch (e) {
        if (!cancelled) {
          setCameraError(e?.message || 'カメラ映像の接続に失敗しました。');
          stopMediaStream(cameraStreamRef.current);
          cameraStreamRef.current = null;
          detachCameraFromVideo(videoRef.current);
          setCameraOn(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cameraOn]);

  useEffect(() => {
    if (!cameraOn) return undefined;
    const placeBottomRight = () => {
      const stage = stageRef.current;
      if (!stage) return;
      const next = computeBottomRightLayout(stage.clientWidth, stage.clientHeight, pipLayoutRef.current.size);
      handlePipLayoutChange(next);
    };
    placeBottomRight();
    window.addEventListener('resize', placeBottomRight);
    return () => window.removeEventListener('resize', placeBottomRight);
  }, [cameraOn, handlePipLayoutChange, isFullscreen]);

  const disableCamera = useCallback(async () => {
    const session = recordingSessionRef.current;
    if (session) {
      const blob = await session.stop();
      recordingSessionRef.current = null;
      setIsRecording(false);
      if (blob?.size > 0) {
        closeRecordingPreview();
        previewBlobRef.current = blob;
        setRecordingPreviewMime(blob.type || session.mimeType || '');
        setRecordingPreviewUrl(URL.createObjectURL(blob));
      }
    }
    stopMediaStream(cameraStreamRef.current);
    cameraStreamRef.current = null;
    detachCameraFromVideo(videoRef.current);
    setCameraOn(false);
  }, [closeRecordingPreview]);

  const startRecording = useCallback(async () => {
    const stream = cameraStreamRef.current;
    const video = videoRef.current;
    if (!stream || !video || !cameraOn) return;
    setCameraError('');
    setRecordingBusy(true);
    try {
      await waitForVideoFrame(video);
      recordingSessionRef.current = startCameraRecording(stream);
      setIsRecording(true);
    } catch (e) {
      setCameraError(e?.message || '録画を開始できませんでした。');
    } finally {
      setRecordingBusy(false);
    }
  }, [cameraOn]);

  const stopRecording = useCallback(async () => {
    const session = recordingSessionRef.current;
    if (!session) return;
    setRecordingBusy(true);
    try {
      const blob = await session.stop();
      recordingSessionRef.current = null;
      setIsRecording(false);
      if (blob?.size > 0) {
        closeRecordingPreview();
        previewBlobRef.current = blob;
        setRecordingPreviewMime(blob.type || session.mimeType || '');
        setRecordingPreviewUrl(URL.createObjectURL(blob));
      } else {
        setCameraError('録画データが空でした。もう一度お試しください。');
      }
    } finally {
      setRecordingBusy(false);
    }
  }, [closeRecordingPreview]);

  useEffect(() => {
    return () => {
      recordingSessionRef.current?.stop();
      stopMediaStream(cameraStreamRef.current);
      detachCameraFromVideo(videoRef.current);
      if (recordingPreviewUrl) URL.revokeObjectURL(recordingPreviewUrl);
    };
  }, [recordingPreviewUrl]);

  useEffect(() => {
    const onFsChange = () => {
      const active = document.fullscreenElement === stageRef.current;
      setIsFullscreen(active);
      requestAnimationFrame(resizeCanvas);
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, [resizeCanvas]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return undefined;
    resizeCanvas();
    const ro = new ResizeObserver(() => resizeCanvas());
    ro.observe(stage);
    return () => ro.disconnect();
  }, [resizeCanvas, isFullscreen]);

  useEffect(() => {
    const s = stateRef.current;
    s.mode = mode;
    s.oknDegPerSec = oknDegPerSec;
    s.viewDistanceCm = viewDistanceCm;
    s.screenWidthCm = screenWidthCm;
    s.oknDir = oknDir;
    s.pursuitHz = pursuitHz;
    s.pursuitAmpDeg = pursuitAmpDeg;
    s.gazeEccentricDeg = gazeEccentricDeg;
    s.gazePathology = gazePathology;
  }, [mode, oknDegPerSec, oknDir, viewDistanceCm, screenWidthCm, pursuitHz, pursuitAmpDeg, gazeEccentricDeg, gazePathology]);

  useEffect(() => {
    const s = stateRef.current;
    s.mode = mode;
    s.eyeNorm = 0;
    s.oknPhase = 'slow';
    s.saccadeIndex = 0;
    s.saccadeNextAt = 0;
    s.gazeIndex = 0;
    s.gazeHoldUntil = 0;
    s.eyeNormY = 0;
    s.gazeNystPhase = 0;
    setPhaseLabel('—');
    phaseLabelRef.current = '—';
  }, [mode]);

  useEffect(() => {
    stateRef.current.running = running;
    if (running) {
      stateRef.current.t0 = performance.now();
      stateRef.current.lastTs = performance.now();
      stateRef.current.saccadeNextAt = performance.now() + 1200;
      stateRef.current.gazeIndex = 0;
      stateRef.current.gazeHoldUntil = 0;
      stateRef.current.eyeNorm = 0;
      stateRef.current.eyeNormY = 0;
    } else if (stateRef.current.mode === MODES.GAZE) {
      stateRef.current.gazeIndex = 0;
      stateRef.current.gazeHoldUntil = 0;
      stateRef.current.eyeNorm = 0;
      stateRef.current.eyeNormY = 0;
    }
  }, [running]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');

    const step = (ts) => {
      const s = stateRef.current;
      const layout = layoutRef.current;
      const { w, h } = layout;
      const dt = Math.min(0.05, (ts - (s.lastTs || ts)) / 1000);
      s.lastTs = ts;
      const elapsed = (ts - s.t0) / 1000;
      const pursuitState =
        s.mode === MODES.PURSUIT
          ? getPursuitTarget(
              elapsed,
              s.pursuitHz,
              s.pursuitAmpDeg,
              w,
              s.viewDistanceCm,
              s.screenWidthCm,
              s.running
            )
          : null;
      const gazeSequence =
        s.mode === MODES.GAZE ? buildGazeSequence(s.gazeEccentricDeg) : [];
      const gazeViewport =
        s.mode === MODES.GAZE ? getGazeViewport(layout, isFullscreen, panelOpen) : null;
      const gazeStep =
        s.mode === MODES.GAZE && gazeSequence.length > 0
          ? s.running
            ? gazeSequence[s.gazeIndex % gazeSequence.length]
            : { degX: 0, degY: 0, label: '正中', holdSec: GAZE_CENTER_HOLD_SEC }
          : null;
      const gazeTarget =
        gazeStep != null && gazeViewport != null
          ? getGazeTargetPx(
              gazeStep.degX,
              gazeStep.degY,
              layout,
              s.viewDistanceCm,
              s.screenWidthCm,
              gazeViewport
            )
          : null;
      const gazeNorm =
        gazeTarget != null && gazeViewport != null
          ? gazePxToNorm(gazeTarget.xPx, gazeTarget.yPx, gazeViewport, layout)
          : null;

      if (s.running) {
        if (s.mode === MODES.OKN) {
          const oknPxPerSec = degPerSecToPxPerSec(
            s.oknDegPerSec,
            w,
            s.viewDistanceCm,
            s.screenWidthCm
          );
          const vel = (s.oknDir * oknPxPerSec) / (w * 0.38);
          const limit = 0.42;
          const fastVel = 6.5;
          if (s.oknPhase === 'slow') {
            s.eyeNorm += vel * dt * 0.92;
            if ((s.oknDir > 0 && s.eyeNorm >= limit) || (s.oknDir < 0 && s.eyeNorm <= -limit)) {
              s.oknPhase = 'fast';
            }
          } else {
            s.eyeNorm -= Math.sign(s.eyeNorm || s.oknDir) * fastVel * dt;
            if (Math.abs(s.eyeNorm) < 0.04) {
              s.eyeNorm = 0;
              s.oknPhase = 'slow';
            }
          }
        } else if (s.mode === MODES.PURSUIT && pursuitState) {
          s.eyeNorm += (pursuitState.targetNorm - s.eyeNorm) * clamp(s.pursuitLag, 0.03, 0.25);
        } else if (s.mode === MODES.SACCADE) {
          const target = s.saccadeTargets[s.saccadeIndex];
          const diff = target - s.eyeNorm;
          if (Math.abs(diff) > 0.01) {
            s.eyeNorm += diff * clamp(18 * dt, 0.08, 0.55);
          } else {
            s.eyeNorm = target;
            if (ts >= s.saccadeNextAt) {
              s.saccadeIndex = (s.saccadeIndex + 1) % s.saccadeTargets.length;
              s.saccadeNextAt = ts + 1100;
            }
          }
        } else if (s.mode === MODES.GAZE && gazeNorm) {
          const targetNormX = gazeNorm.normX;
          const targetNormY = gazeNorm.normY;
          const eccentric =
            Math.abs(gazeStep.degX) > 0.5 || Math.abs(gazeStep.degY) > 0.5;

          if (s.gazePathology && eccentric) {
            s.gazeNystPhase += dt * 3.2;
            const amp = 0.07 + (Math.abs(targetNormX) + Math.abs(targetNormY)) * 0.04;
            s.eyeNorm = targetNormX + Math.sin(s.gazeNystPhase) * amp;
            s.eyeNormY += (targetNormY - s.eyeNormY) * 0.12;
          } else {
            const saccStep = clamp(18 * dt, 0.08, 0.55);
            const diffX = targetNormX - s.eyeNorm;
            const diffY = targetNormY - s.eyeNormY;
            if (Math.abs(diffX) > 0.01) s.eyeNorm += diffX * saccStep;
            else s.eyeNorm = targetNormX;
            if (Math.abs(diffY) > 0.01) s.eyeNormY += diffY * saccStep;
            else s.eyeNormY = targetNormY;
          }

          const atTarget =
            Math.abs(s.eyeNorm - targetNormX) < 0.02 &&
            Math.abs(s.eyeNormY - targetNormY) < 0.02;
          if (atTarget) {
            if (s.gazeHoldUntil === 0) {
              s.gazeHoldUntil = ts + gazeStep.holdSec * 1000;
            } else if (ts >= s.gazeHoldUntil) {
              s.gazeIndex = (s.gazeIndex + 1) % gazeSequence.length;
              s.gazeHoldUntil = 0;
            }
          } else {
            s.gazeHoldUntil = 0;
          }
        }
      }

      ctx.fillStyle = isFullscreen ? '#0f172a' : '#f1f5f9';
      ctx.fillRect(0, 0, w, h);

      let targetPx = w / 2;

      if (s.mode === MODES.OKN) {
        const oknPxPerSec = degPerSecToPxPerSec(
          s.oknDegPerSec,
          w,
          s.viewDistanceCm,
          s.screenWidthCm
        );
        const offset = s.running ? elapsed * oknPxPerSec * s.oknDir : 0;
        drawOknStripes(ctx, offset, s.oknDir, layout, s.oknDegPerSec);
        if (s.running) {
          updatePhaseLabel(s.oknPhase === 'slow' ? '徐波相（追従）' : '速波相（リセット）');
        }
      } else {
        if (s.mode !== MODES.GAZE) {
          ctx.fillStyle = isFullscreen ? '#1e293b' : '#e2e8f0';
          ctx.fillRect(0, 0, w, layout.stimH);
          ctx.strokeStyle = '#64748b';
          ctx.beginPath();
          ctx.moveTo(w / 2, 12);
          ctx.lineTo(w / 2, layout.stimH);
          ctx.stroke();
        }

        if (s.mode === MODES.PURSUIT && pursuitState) {
          if (s.running) {
            drawPursuitSineGuide(ctx, elapsed, s.pursuitHz, s.pursuitAmpDeg, layout, s.viewDistanceCm, s.screenWidthCm);
          }
          targetPx = drawTarget(ctx, pursuitState.xPx, layout, '#ef4444', { clampX: false });
          if (s.running) updatePhaseLabel(`滑動性追跡中（sin ±${s.pursuitAmpDeg}°）`);
        } else if (s.mode === MODES.SACCADE) {
          const target = s.running ? s.saccadeTargets[s.saccadeIndex] : 0;
          targetPx = drawTarget(ctx, normToPx(target, layout), layout);
          if (s.running) updatePhaseLabel('跳躍性眼球運動');
        } else if (s.mode === MODES.GAZE && gazeTarget && gazeViewport) {
          ctx.fillStyle = isFullscreen ? '#1e293b' : '#e2e8f0';
          ctx.fillRect(0, gazeViewport.topMargin, w, gazeViewport.usableH);
          ctx.strokeStyle = '#64748b';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(gazeViewport.centerX, gazeViewport.topMargin + 8);
          ctx.lineTo(gazeViewport.centerX, gazeViewport.topMargin + gazeViewport.usableH - 8);
          ctx.moveTo(48, gazeViewport.centerY);
          ctx.lineTo(w - 48, gazeViewport.centerY);
          ctx.stroke();
          targetPx = drawFixationCross(
            ctx,
            gazeTarget.xPx,
            gazeTarget.yPx,
            layout,
            gazeViewport
          );
          if (s.running) {
            const atTarget =
              gazeNorm &&
              Math.abs(s.eyeNorm - gazeNorm.normX) < 0.02 &&
              Math.abs(s.eyeNormY - gazeNorm.normY) < 0.02;
            const holdLeft =
              atTarget && s.gazeHoldUntil > ts
                ? Math.ceil((s.gazeHoldUntil - ts) / 1000)
                : null;
            if (holdLeft != null) {
              updatePhaseLabel(`${gazeStep.label} 注視中（残り ${holdLeft}s）`);
            } else if (s.gazePathology && (Math.abs(gazeStep.degX) > 0.5 || Math.abs(gazeStep.degY) > 0.5)) {
              updatePhaseLabel(`${gazeStep.label} 注視誘発眼振`);
            } else {
              updatePhaseLabel(atTarget ? `${gazeStep.label} 注視中` : `${gazeStep.label} へ跳躍`);
            }
          }
        }
      }

      const eyeYPx =
        s.mode === MODES.GAZE && gazeViewport
          ? s.eyeNormY * gazeViewport.maxOffsetY * 0.55
          : s.eyeNormY * layout.stimH * 0.28;
      drawEye(ctx, normToPx(s.eyeNorm, layout), layout, '', eyeYPx);

      ctx.fillStyle = isFullscreen ? '#94a3b8' : '#64748b';
      ctx.font = `${Math.max(11, w * 0.014)}px system-ui, sans-serif`;
      ctx.textAlign = 'left';
      ctx.fillText('正中', w / 2 - 14, h - 16);
      if (s.mode !== MODES.OKN) {
        ctx.textAlign = 'right';
        let targetLabel;
        if (s.mode === MODES.PURSUIT && pursuitState) {
          targetLabel = `標的 約 ${pursuitState.targetDeg >= 0 ? '+' : ''}${pursuitState.targetDeg.toFixed(0)}°`;
        } else if (s.mode === MODES.GAZE && gazeTarget) {
          const hLabel =
            Math.abs(gazeTarget.degX) < 0.5
              ? ''
              : ` H${gazeTarget.degX >= 0 ? '+' : ''}${gazeTarget.degX.toFixed(0)}°`;
          const vLabel =
            Math.abs(gazeTarget.degY) < 0.5
              ? ''
              : ` V${gazeTarget.degY >= 0 ? '+' : ''}${gazeTarget.degY.toFixed(0)}°`;
          targetLabel = `標的${hLabel || vLabel ? '' : ' 正中'}${hLabel}${vLabel}`;
        } else {
          const targetDeg = normToDeg(pxToNorm(targetPx, layout), w, s.viewDistanceCm, s.screenWidthCm);
          targetLabel = `標的 約 ${targetDeg >= 0 ? '+' : ''}${targetDeg.toFixed(0)}°`;
        }
        ctx.fillText(targetLabel, w - 16, Math.max(20, layout.stimH * 0.12));
      }

      rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [mode, running, updatePhaseLabel, isFullscreen, panelOpen]);

  const info = MODE_INFO[mode];
  const controlProps = {
    mode,
    oknDegPerSec,
    setOknDegPerSec,
    viewDistanceCm,
    setViewDistanceCm,
    screenWidthCm,
    setScreenWidthCm,
    oknDir,
    setOknDir,
    pursuitHz,
    setPursuitHz,
    pursuitAmpDeg,
    setPursuitAmpDeg,
    gazeEccentricDeg,
    setGazeEccentricDeg,
    gazePathology,
    setGazePathology,
    stateRef,
  };

  const modeButtons = (
    <div className="flex flex-wrap gap-1.5">
      {Object.entries(MODES).map(([, value]) => (
        <button
          key={value}
          type="button"
          onClick={() => {
            setRunning(false);
            setMode(value);
          }}
          className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
            mode === value
              ? 'bg-indigo-600 text-white border-indigo-600'
              : 'bg-white/95 text-gray-700 border-gray-300 hover:bg-gray-50'
          }`}
        >
          {MODE_INFO[value].title.split('（')[0].trim()}
        </button>
      ))}
    </div>
  );

  return (
    <div className={`min-h-screen bg-gray-50 ${isFullscreen ? 'p-0' : 'p-4 md:p-6'}`}>
      <div className={isFullscreen ? '' : 'max-w-5xl mx-auto'}>
        {!isFullscreen && (
          <>
            <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
              <div>
                <p className="text-sm text-indigo-600 font-medium">Audioscope EDU</p>
                <h1 className="text-2xl md:text-3xl font-bold text-gray-900">
                  Eye Movement Simulator
                </h1>
                <p className="text-gray-600 text-sm mt-1">眼球運動シミュレータ</p>
              </div>
              <button
                type="button"
                onClick={() => { window.location.href = '/'; }}
                className="px-4 py-2 text-sm bg-gray-600 text-white rounded-lg hover:bg-gray-700 shrink-0"
              >
                メインアプリに戻る
              </button>
            </header>

            <div className="flex flex-wrap gap-2 mb-4">
              {Object.entries(MODES).map(([, value]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setRunning(false);
                    setMode(value);
                  }}
                  className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    mode === value
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {MODE_INFO[value].title.split('（')[0].trim()}
                </button>
              ))}
            </div>
          </>
        )}

        <div
          ref={stageRef}
          className={
            isFullscreen
              ? 'fixed inset-0 z-50 bg-slate-900'
              : 'relative bg-slate-900 rounded-2xl shadow-lg border border-gray-200 overflow-hidden mb-4 h-[360px] md:h-[420px]'
          }
        >
          <canvas ref={canvasRef} className="absolute inset-0 w-full h-full block" />
          {cameraOn && (
            <CameraPipOverlay
              videoRef={videoRef}
              containerRef={stageRef}
              layout={pipLayout}
              onLayoutChange={handlePipLayoutChange}
              disabled={isRecording}
            />
          )}

          {/* 上部オーバーレイ：モード・状態・主要操作 */}
          <div className="absolute top-0 left-0 right-0 z-10 p-3 pointer-events-none">
            <div className="flex flex-wrap items-start justify-between gap-2 pointer-events-auto">
              <div className="bg-white/92 backdrop-blur-sm rounded-xl border border-gray-200 shadow-lg px-3 py-2 max-w-[min(100%,720px)]">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span className="text-xs font-semibold text-indigo-800">{info.title}</span>
                  <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                    {running ? phaseLabel : '停止中'}
                  </span>
                  {isRecording && (
                    <span className="text-xs text-rose-700 bg-rose-100 px-2 py-0.5 rounded font-medium">
                      ● REC
                    </span>
                  )}
                </div>
                {isFullscreen && modeButtons}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setRunning((r) => !r)}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold text-white shadow-lg ${
                    running ? 'bg-rose-600 hover:bg-rose-700' : 'bg-emerald-600 hover:bg-emerald-700'
                  }`}
                >
                  {running ? '■ 停止' : '▶ 開始'}
                </button>
                <button
                  type="button"
                  onClick={toggleFullscreen}
                  className="px-3 py-2 rounded-lg text-sm font-medium bg-gray-800/90 text-white hover:bg-gray-700 shadow-lg"
                >
                  {isFullscreen ? '⤢ 終了' : '⛶ フルスクリーン'}
                </button>
                <button
                  type="button"
                  onClick={cameraOn ? disableCamera : enableCamera}
                  disabled={recordingBusy}
                  className="px-3 py-2 rounded-lg text-sm font-medium bg-slate-700/90 text-white hover:bg-slate-600 shadow-lg disabled:opacity-50"
                >
                  {cameraOn ? 'カメラ OFF' : '📷 カメラ'}
                </button>
                <button
                  type="button"
                  onClick={isRecording ? stopRecording : startRecording}
                  disabled={!cameraOn || recordingBusy}
                  className={`px-3 py-2 rounded-lg text-sm font-medium text-white shadow-lg disabled:opacity-50 ${
                    isRecording ? 'bg-rose-700 hover:bg-rose-800' : 'bg-violet-700 hover:bg-violet-800'
                  }`}
                >
                  {isRecording ? '■ 録画停止' : '● 録画'}
                </button>
              </div>
            </div>
            {cameraError && (
              <p className="pointer-events-auto mt-2 mx-0 text-xs text-rose-100 bg-rose-900/80 rounded-lg px-3 py-2 max-w-md">
                {cameraError}
              </p>
            )}
          </div>

          {/* 下部オーバーレイ：操作パネル（フルスクリーンでも使用可） */}
          <div className="absolute bottom-0 left-0 right-0 z-10 pointer-events-none">
            <div className="pointer-events-auto mx-3 mb-3">
              <button
                type="button"
                onClick={() => setPanelOpen((o) => !o)}
                className="w-full flex items-center justify-center gap-2 bg-white/92 backdrop-blur-sm border border-gray-200 rounded-t-xl py-2 text-sm font-medium text-gray-700 hover:bg-white shadow-lg"
              >
                {panelOpen ? '▼ 操作パネルを閉じる' : '▲ 操作パネルを開く'}
              </button>
              {panelOpen && (
                <div className="bg-white/95 backdrop-blur-sm border border-t-0 border-gray-200 rounded-b-xl shadow-lg px-4 py-3 max-h-[38vh] overflow-y-auto">
                  {!isFullscreen && (
                    <p className="text-xs text-indigo-700 mb-2 pb-2 border-b border-gray-100">{info.subtitle}</p>
                  )}
                  <ModeControls {...controlProps} compact={isFullscreen} />
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <p className="text-xs font-medium text-gray-700 mb-1">動画録画（カメラのみ）</p>
                    <p className="text-xs text-gray-500 leading-relaxed">
                      録画されるのは<strong>カメラ映像のみ</strong>です（PC画面は含みません）。ライブ確認用の枠は
                      <strong>ドラッグで移動</strong>、右下で<strong>拡大・縮小</strong>できます。眼球の動きが見えるよう大きめに表示してください。
                    </p>
                  </div>
                  {isFullscreen && (
                    <p className="text-xs text-gray-400 mt-3">
                      Esc キーでもフルスクリーンを終了できます。操作パネルは表示したまま検査できます。
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {!isFullscreen && (
          <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm mb-4">
            <h3 className="font-semibold text-gray-800 mb-2">解説</h3>
            <p className="text-sm text-gray-600 leading-relaxed">{info.description}</p>
            <ul className="mt-3 text-sm text-gray-600 space-y-1 list-disc list-inside">
              <li>録画はカメラ映像のみ（フル解像度）。ライブ枠は拡大して眼球運動を確認してください</li>
                {mode === MODES.OKN && (
                  <>
                    <li>上段：視運動刺激（ストライプパターン）</li>
                    <li>速度は視角速度（°/s）で調整（視距離50cm・画面幅約34cm想定）</li>
                    <li>下段：眼球の徐波相・速波相を模した水平運動</li>
                  </>
                )}
              {mode === MODES.PURSUIT && (
                <>
                  <li>赤い標的が正弦波（sin）で左右に動き、眼球がなめらかに追従します</li>
                  <li>振幅は視角（±5°・10°・15°）で調整（最大±15°・フルスクリーン推奨）</li>
                  <li>破線は標的の sin 軌道の目安です</li>
                  <li>追従の遅れは滑動性追跡の特性を簡略化して表現しています</li>
                </>
              )}
              {mode === MODES.SACCADE && (
                <li>標的位置へ跳躍的に眼球が移動します（潜伏期は省略）</li>
              )}
              {mode === MODES.GAZE && (
                <>
                  <li>緑の十字が右→正中→左→正中→上→正中→下→正中の順に自動で跳躍します</li>
                  <li>偏心位置で10秒、正中に戻ったときは5秒静止します</li>
                  <li>偏心角度は視距離50cm想定で最大±15°（フルスクリーン推奨）</li>
                  <li>病態モード ON で偏心注視時の眼振様運動を表示します</li>
                </>
              )}
            </ul>
            <p className="text-xs text-gray-400 mt-3">
              ※ 教育用の概念シミュレーションです。臨床計測（ENG/VNG）の波形とは異なります。
            </p>
          </div>
        )}
      </div>
      <RecordingPreviewModal
        previewUrl={recordingPreviewUrl}
        mimeType={recordingPreviewMime}
        onClose={closeRecordingPreview}
        onDownload={downloadRecordingPreview}
      />
    </div>
  );
}
