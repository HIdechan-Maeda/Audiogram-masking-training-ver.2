import React, { useCallback, useEffect, useRef } from 'react';
import { PIP_HEADER_PX } from './simulatorRecording';

const ASPECT = 0.75;
const MIN_SIZE = 0.28;
const MAX_SIZE = 0.65;

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function layoutToPx(layout, stageW, stageH) {
  const pipW = stageW * layout.size;
  const pipH = pipW * ASPECT;
  const left = clamp(layout.x * stageW, 0, Math.max(0, stageW - pipW));
  const top = clamp(layout.y * stageH, 0, Math.max(0, stageH - pipH - PIP_HEADER_PX));
  return { pipW, pipH, left, top };
}

export default function CameraPipOverlay({
  videoRef,
  containerRef,
  layout,
  onLayoutChange,
  disabled = false,
}) {
  const interactionRef = useRef(null);

  const readStage = useCallback(() => {
    const el = containerRef.current;
    if (!el) return null;
    return { w: el.clientWidth, h: el.clientHeight };
  }, [containerRef]);

  const commitLayout = useCallback(
    (next) => {
      const stage = readStage();
      if (!stage) return;
      const size = clamp(next.size, MIN_SIZE, MAX_SIZE);
      const { pipW, pipH } = layoutToPx({ ...next, size }, stage.w, stage.h);
      const x = clamp(next.x, 0, pipW >= stage.w ? 0 : 1 - pipW / stage.w);
      const y = clamp(next.y, 0, pipH >= stage.h ? 0 : 1 - pipH / stage.h);
      onLayoutChange({ x, y, size });
    },
    [onLayoutChange, readStage]
  );

  useEffect(() => {
    const onPointerMove = (e) => {
      const data = interactionRef.current;
      if (!data || disabled) return;
      const stage = readStage();
      if (!stage) return;

      if (data.type === 'drag') {
        const pipW = stage.w * layout.size;
        const pipH = pipW * ASPECT;
        const left = clamp(data.originLeft + (e.clientX - data.startX), 0, stage.w - pipW);
        const top = clamp(data.originTop + (e.clientY - data.startY), 0, stage.h - pipH);
        onLayoutChange({
          x: left / stage.w,
          y: top / stage.h,
          size: layout.size,
        });
      } else if (data.type === 'resize') {
        const nextW = clamp(data.originW + (e.clientX - data.startX), stage.w * MIN_SIZE, stage.w * MAX_SIZE);
        const nextH = nextW * ASPECT;
        const maxY = stage.h - nextH - PIP_HEADER_PX;
        const top = clamp(layout.y * stage.h, 0, Math.max(0, maxY));
        const maxX = stage.w - nextW;
        const left = clamp(layout.x * stage.w, 0, Math.max(0, maxX));
        onLayoutChange({
          x: left / stage.w,
          y: top / stage.h,
          size: nextW / stage.w,
        });
      }
    };

    const onPointerUp = () => {
      interactionRef.current = null;
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [disabled, layout, onLayoutChange, readStage]);

  const stage = readStage();
  if (!stage) return null;
  const { pipW, pipH, left, top } = layoutToPx(layout, stage.w, stage.h);

  const startDrag = (e) => {
    if (disabled) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    interactionRef.current = {
      type: 'drag',
      startX: e.clientX,
      startY: e.clientY,
      originLeft: left,
      originTop: top,
    };
  };

  const startResize = (e) => {
    if (disabled) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    interactionRef.current = {
      type: 'resize',
      startX: e.clientX,
      startY: e.clientY,
      originW: pipW,
    };
  };

  return (
    <div
      className="absolute z-30 flex flex-col rounded-lg border-2 border-white/90 bg-slate-900 shadow-2xl overflow-hidden"
      style={{ left, top, width: pipW, height: pipH + PIP_HEADER_PX }}
    >
      <div
        className={`flex items-center justify-between px-2 h-7 bg-slate-900/95 text-white text-[11px] shrink-0 ${
          disabled ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'
        }`}
        onPointerDown={startDrag}
      >
        <span>カメラ</span>
        <span className="text-slate-400 hidden sm:inline">
          {disabled ? '録画中' : 'ドラッグで移動'}
        </span>
      </div>
      <div className="relative flex-1 min-h-0 bg-black">
        <video ref={videoRef} playsInline muted autoPlay className="w-full h-full object-cover" />
        {!disabled && (
          <div
            role="presentation"
            className="absolute right-0 bottom-0 w-6 h-6 cursor-se-resize bg-white/90 border border-slate-300 rounded-tl-md"
            onPointerDown={startResize}
            title="ドラッグで拡大・縮小"
          />
        )}
      </div>
    </div>
  );
}

const MARGIN = 0.02;

/** ステージ右下に PiP を配置するレイアウトを算出 */
export function computeBottomRightLayout(stageW, stageH, size = 0.52) {
  const s = clamp(size, MIN_SIZE, MAX_SIZE);
  if (stageW <= 0 || stageH <= 0) {
    return { x: 1 - s - MARGIN, y: 0.95, size: s };
  }
  const pipW = stageW * s;
  const pipH = pipW * ASPECT;
  const totalH = pipH + PIP_HEADER_PX;
  const maxLeft = Math.max(0, stageW - pipW);
  const maxTop = Math.max(0, stageH - totalH);
  const left = clamp(stageW * (1 - s - MARGIN), 0, maxLeft);
  const top = clamp(maxTop - stageH * MARGIN, 0, maxTop);
  return {
    x: left / stageW,
    y: top / stageH,
    size: s,
  };
}

export const DEFAULT_PIP_LAYOUT = computeBottomRightLayout(820, 420, 0.52);
