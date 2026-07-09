import React, { useCallback, useEffect, useRef, useState } from 'react';

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
      '正中・左右への偏心注視時の眼球の安定性を観察します。正常ではほぼ静止しますが、注視誘発眼振では偏心方向へ徐波相、戻り方向へ速波相が出現します。',
  },
};

const DEFAULT_W = 820;
const DEFAULT_H = 360;

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
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

function drawEye(ctx, xPx, layout, label) {
  const { w, eyeY, eyeRadius } = layout;
  const x = clamp(xPx, eyeRadius + 24, w - eyeRadius - 24);

  ctx.save();
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(w / 2, eyeY - eyeRadius - 34);
  ctx.lineTo(x, eyeY - eyeRadius - 8);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(x, eyeY, eyeRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  const irisR = eyeRadius * 0.4;
  ctx.fillStyle = '#60a5fa';
  ctx.beginPath();
  ctx.arc(x, eyeY, irisR, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.arc(x, eyeY, irisR * 0.45, 0, Math.PI * 2);
  ctx.fill();

  if (label) {
    ctx.fillStyle = '#475569';
    ctx.font = `${Math.max(11, eyeRadius * 0.32)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(label, x, eyeY + eyeRadius + 18);
  }
  ctx.restore();
  return x;
}

function drawTarget(ctx, xPx, layout, color = '#ef4444') {
  const { w, targetY } = layout;
  const x = clamp(xPx, 40, w - 40);
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

function drawFixationCross(ctx, xPx, layout) {
  const { w, targetY } = layout;
  const x = clamp(xPx, 40, w - 40);
  const s = clamp(layout.w * 0.015, 10, 18);
  ctx.save();
  ctx.strokeStyle = '#22c55e';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(x - s, targetY);
  ctx.lineTo(x + s, targetY);
  ctx.moveTo(x, targetY - s);
  ctx.lineTo(x, targetY + s);
  ctx.stroke();
  ctx.restore();
  return x;
}

function drawOknStripes(ctx, offset, direction, layout) {
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
  ctx.fillText(
    direction > 0 ? 'パターン → 右方向移動' : 'パターン ← 左方向移動',
    w / 2,
    Math.max(20, stimH * 0.08)
  );
  ctx.restore();
}

function ModeControls({
  mode,
  oknSpeed,
  setOknSpeed,
  oknDir,
  setOknDir,
  pursuitHz,
  setPursuitHz,
  pursuitAmp,
  setPursuitAmp,
  gazePos,
  setGazePos,
  gazePathology,
  setGazePathology,
  stateRef,
  compact = false,
}) {
  return (
    <div className={compact ? 'space-y-2' : ''}>
      {mode === MODES.OKN && (
        <div className="flex flex-wrap gap-4 items-end">
          <label className="text-sm">
            <span className="block text-gray-600 mb-1">パターン速度</span>
            <input
              type="range"
              min={40}
              max={220}
              value={oknSpeed}
              onChange={(e) => setOknSpeed(Number(e.target.value))}
              className={compact ? 'w-32' : 'w-40'}
            />
            <span className="ml-2 text-gray-800">{oknSpeed}</span>
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
      )}

      {mode === MODES.PURSUIT && (
        <div className="flex flex-wrap gap-6">
          <label className="text-sm">
            <span className="block text-gray-600 mb-1">標的の周波数 (Hz)</span>
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
          <label className="text-sm">
            <span className="block text-gray-600 mb-1">振幅</span>
            <input
              type="range"
              min={0.3}
              max={0.9}
              step={0.05}
              value={pursuitAmp}
              onChange={(e) => setPursuitAmp(Number(e.target.value))}
              className={compact ? 'w-32' : 'w-40'}
            />
            <span className="ml-2">{pursuitAmp.toFixed(2)}</span>
          </label>
        </div>
      )}

      {mode === MODES.SACCADE && (
        <p className="text-sm text-gray-600">
          標的が正中 → 右 → 左 → 正中の順に跳躍します。眼球は素早く標的位置へ移動します。
        </p>
      )}

      {mode === MODES.GAZE && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {[
              { label: '左30°', v: -0.75 },
              { label: '正中', v: 0 },
              { label: '右30°', v: 0.75 },
            ].map((g) => (
              <button
                key={g.label}
                type="button"
                onClick={() => {
                  setGazePos(g.v);
                  stateRef.current.gazePos = g.v;
                }}
                className={`px-3 py-1.5 rounded-lg border text-sm ${
                  gazePos === g.v ? 'bg-green-100 border-green-500 text-green-900' : 'bg-white'
                }`}
              >
                {g.label}
              </button>
            ))}
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
    oknSpeed: 120,
    pursuitAmp: 0.75,
    pursuitHz: 0.35,
    pursuitLag: 0.08,
    saccadeTargets: [-0.75, 0, 0.75, 0],
    saccadeIndex: 0,
    saccadeNextAt: 0,
    gazePos: 0,
    gazePathology: false,
    gazeNystPhase: 0,
  });

  const [mode, setMode] = useState(MODES.OKN);
  const [running, setRunning] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);
  const [oknSpeed, setOknSpeed] = useState(120);
  const [oknDir, setOknDir] = useState(1);
  const [pursuitHz, setPursuitHz] = useState(0.35);
  const [pursuitAmp, setPursuitAmp] = useState(0.75);
  const [gazePos, setGazePos] = useState(0);
  const [gazePathology, setGazePathology] = useState(false);
  const [phaseLabel, setPhaseLabel] = useState('—');
  const phaseLabelRef = useRef('—');

  const updatePhaseLabel = useCallback((label) => {
    if (phaseLabelRef.current !== label) {
      phaseLabelRef.current = label;
      setPhaseLabel(label);
    }
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
    s.oknSpeed = oknSpeed;
    s.oknDir = oknDir;
    s.pursuitHz = pursuitHz;
    s.pursuitAmp = pursuitAmp;
    s.gazePos = gazePos;
    s.gazePathology = gazePathology;
  }, [mode, oknSpeed, oknDir, pursuitHz, pursuitAmp, gazePos, gazePathology]);

  useEffect(() => {
    const s = stateRef.current;
    s.mode = mode;
    s.eyeNorm = 0;
    s.oknPhase = 'slow';
    s.saccadeIndex = 0;
    s.saccadeNextAt = 0;
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

      if (s.running) {
        if (s.mode === MODES.OKN) {
          const vel = (s.oknDir * s.oknSpeed) / (w * 0.38);
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
        } else if (s.mode === MODES.PURSUIT) {
          const target = Math.sin(elapsed * Math.PI * 2 * s.pursuitHz) * s.pursuitAmp;
          s.eyeNorm += (target - s.eyeNorm) * clamp(s.pursuitLag, 0.03, 0.25);
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
        } else if (s.mode === MODES.GAZE) {
          const base = s.gazePos;
          if (s.gazePathology && Math.abs(base) > 0.2) {
            s.gazeNystPhase += dt * 3.2;
            const amp = 0.07 + Math.abs(base) * 0.06;
            s.eyeNorm = base + Math.sin(s.gazeNystPhase) * amp;
          } else {
            s.eyeNorm += (base - s.eyeNorm) * 0.12;
          }
        }
      }

      ctx.fillStyle = isFullscreen ? '#0f172a' : '#f1f5f9';
      ctx.fillRect(0, 0, w, h);

      let targetPx = w / 2;

      if (s.mode === MODES.OKN) {
        const offset = s.running ? elapsed * s.oknSpeed * s.oknDir : 0;
        drawOknStripes(ctx, offset, s.oknDir, layout);
        if (s.running) {
          updatePhaseLabel(s.oknPhase === 'slow' ? '徐波相（追従）' : '速波相（リセット）');
        }
      } else {
        ctx.fillStyle = isFullscreen ? '#1e293b' : '#e2e8f0';
        ctx.fillRect(0, 0, w, layout.stimH);
        ctx.strokeStyle = '#64748b';
        ctx.beginPath();
        ctx.moveTo(w / 2, 12);
        ctx.lineTo(w / 2, layout.stimH);
        ctx.stroke();

        if (s.mode === MODES.PURSUIT) {
          const target = s.running
            ? Math.sin(elapsed * Math.PI * 2 * s.pursuitHz) * s.pursuitAmp
            : 0;
          targetPx = drawTarget(ctx, normToPx(target, layout), layout);
          if (s.running) updatePhaseLabel('滑動性追跡中');
        } else if (s.mode === MODES.SACCADE) {
          const target = s.running ? s.saccadeTargets[s.saccadeIndex] : 0;
          targetPx = drawTarget(ctx, normToPx(target, layout), layout);
          if (s.running) updatePhaseLabel('跳躍性眼球運動');
        } else if (s.mode === MODES.GAZE) {
          targetPx = drawFixationCross(ctx, normToPx(s.gazePos, layout), layout);
          if (s.running) {
            updatePhaseLabel(
              s.gazePathology && Math.abs(s.gazePos) > 0.2
                ? '注視誘発眼振（病態モード）'
                : '安定注視'
            );
          }
        }
      }

      drawEye(ctx, normToPx(s.eyeNorm, layout), layout, '');

      ctx.fillStyle = isFullscreen ? '#94a3b8' : '#64748b';
      ctx.font = `${Math.max(11, w * 0.014)}px system-ui, sans-serif`;
      ctx.textAlign = 'left';
      ctx.fillText('正中', w / 2 - 14, h - 16);
      if (s.mode !== MODES.OKN) {
        ctx.textAlign = 'right';
        ctx.fillText(
          `標的 ${Math.round(pxToNorm(targetPx, layout) * 30)}°相当`,
          w - 16,
          Math.max(20, layout.stimH * 0.12)
        );
      }

      rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [mode, running, updatePhaseLabel, isFullscreen]);

  const info = MODE_INFO[mode];
  const controlProps = {
    mode,
    oknSpeed,
    setOknSpeed,
    oknDir,
    setOknDir,
    pursuitHz,
    setPursuitHz,
    pursuitAmp,
    setPursuitAmp,
    gazePos,
    setGazePos,
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

          {/* 上部オーバーレイ：モード・状態・主要操作 */}
          <div className="absolute top-0 left-0 right-0 z-10 p-3 pointer-events-none">
            <div className="flex flex-wrap items-start justify-between gap-2 pointer-events-auto">
              <div className="bg-white/92 backdrop-blur-sm rounded-xl border border-gray-200 shadow-lg px-3 py-2 max-w-[min(100%,720px)]">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span className="text-xs font-semibold text-indigo-800">{info.title}</span>
                  <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                    {running ? phaseLabel : '停止中'}
                  </span>
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
              </div>
            </div>
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
              {mode === MODES.OKN && (
                <>
                  <li>上段：視運動刺激（ストライプパターン）</li>
                  <li>下段：眼球の徐波相・速波相を模した水平運動</li>
                </>
              )}
              {mode === MODES.PURSUIT && (
                <>
                  <li>赤い標的をなめらかに追従します</li>
                  <li>追従の遅れは滑動性追跡の特性を簡略化して表現しています</li>
                </>
              )}
              {mode === MODES.SACCADE && (
                <li>標的位置へ跳躍的に眼球が移動します（潜伏期は省略）</li>
              )}
              {mode === MODES.GAZE && (
                <>
                  <li>緑の十字へ注視した状態を想定しています</li>
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
    </div>
  );
}
