import React, { useEffect, useRef, useState } from 'react';

// シンプルなティンパノグラム曲線（Type A想定）を描画し、gif.js を使ってGIF化
// 仕様（デフォルト）: 800x600, 縦: 0-2.0 mL, 横: -200〜+200 daPa, 5秒, 20fps

export default function TympanogramGif({
  width = 800,
  height = 600,
  xMin = -200,
  xMax = 200,
  yMin = 0,
  yMax = 2.0,
  tympanogramData = null,
  durationMs = 5000,
  fps = 20,
  gridColor = '#e5e7eb',
  axisColor = '#9ca3af',
  bgColor = '#ffffff'
}) {
  const canvasRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const animationRef = useRef(null);

  // スケール変換
  function xToPx(x) {
    const padL = 70, padR = 30;
    return padL + (Math.max(xMin, Math.min(xMax, x)) - xMin) * (width - padL - padR) / (xMax - xMin);
  }
  function yToPx(y) {
    const padT = 30, padB = 50;
    // 上が大きいmL（2.0）、下が0
    const t = padT + (yMax - Math.max(yMin, Math.min(yMax, y))) * (height - padT - padB) / (yMax - yMin);
    return t;
  }

  function drawFrame(ctx, progress01) {
    // 背景
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, width, height);

    // グリッド（daPa 50刻み, mL 0.2刻み）
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let p = xMin; p <= xMax; p += 50) {
      const x = xToPx(p);
      ctx.moveTo(x, yToPx(yMin));
      ctx.lineTo(x, yToPx(yMax));
    }
    for (let c = yMin; c <= yMax + 1e-6; c += 0.2) {
      const y = yToPx(c);
      ctx.moveTo(xToPx(xMin), y);
      ctx.lineTo(xToPx(xMax), y);
    }
    ctx.stroke();

    // 軸
    ctx.strokeStyle = axisColor;
    ctx.lineWidth = 2;
    // X軸
    ctx.beginPath();
    ctx.moveTo(xToPx(xMin), yToPx(0));
    ctx.lineTo(xToPx(xMax), yToPx(0));
    ctx.stroke();
    // Y軸
    ctx.beginPath();
    ctx.moveTo(xToPx(0), yToPx(yMin));
    ctx.lineTo(xToPx(0), yToPx(yMax));
    ctx.stroke();

    // 目盛・ラベル
    ctx.fillStyle = '#111827';
    ctx.font = '14px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial';
    ctx.textAlign = 'center';
    for (let p = xMin; p <= xMax; p += 100) {
      const x = xToPx(p);
      ctx.fillText(`${p}`, x, yToPx(0) + 18);
    }
    ctx.save();
    ctx.translate(18, (yToPx(yMax) + yToPx(yMin)) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText('Compliance (mL)', 0, 0);
    ctx.restore();
    ctx.textAlign = 'right';
    for (let c = yMin; c <= yMax + 1e-6; c += 0.5) {
      const y = yToPx(c);
      ctx.fillText(`${c.toFixed(1)}`, xToPx(xMin) - 6, y + 4);
    }
    ctx.textAlign = 'center';
    ctx.fillText('Pressure (daPa)', (xToPx(xMin) + xToPx(xMax)) / 2, height - 16);

    // 曲線を右→左に進捗描画（+200 daPa側から開始）
    if (!tympanogramData) return;
    
    const steps = 800;
    const showUntil = Math.floor(steps * progress01);
    
    // 左右それぞれ描画
    const leftData = tympanogramData.left;
    const rightData = tympanogramData.right;
    
    if (leftData) {
      ctx.strokeStyle = '#3b82f6'; // 青（左）
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let i = 0; i <= showUntil; i++) {
        const t = i / steps;
        const x = xMax - t * (xMax - xMin); // 右から左へ
        const y = getCompliance(x, leftData, tympanogramData.type);
        const px = xToPx(x);
        const py = yToPx(y);
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
    
    if (rightData) {
      ctx.strokeStyle = '#ef4444'; // 赤（右）
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let i = 0; i <= showUntil; i++) {
        const t = i / steps;
        const x = xMax - t * (xMax - xMin); // 右から左へ
        const y = getCompliance(x, rightData, tympanogramData.type);
        const px = xToPx(x);
        const py = yToPx(y);
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
  }

  function getCompliance(x, data, type) {
    // A型：peakPressure=0
    // B型：peakPressure=-200
    // C型：peakPressure=-100
    // すべてガウス関数で描画
    const mu = data.peakPressure;
    const A = data.peakCompliance;
    const s = data.sigma;
    const v = A * Math.exp(-Math.pow(x - mu, 2) / (2 * s * s));
    return Math.max(yMin, Math.min(yMax, v));
  }

  useEffect(() => {
    // 初期プレビュー描画（空白状態）
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    drawFrame(ctx, 0);
  }, [width, height, xMin, xMax, yMin, yMax, tympanogramData]);

  // アニメーション再生
  function playAnimation() {
    setIsPlaying(true);
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    
    let startTime = null;
    const animate = (timestamp) => {
      if (!startTime) startTime = timestamp;
      const elapsed = timestamp - startTime;
      const progress = Math.min(elapsed / durationMs, 1);
      
      drawFrame(ctx, progress);
      
      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      } else {
        setIsPlaying(false);
      }
    };
    
    animationRef.current = requestAnimationFrame(animate);
  }

  // クリーンアップ
  useEffect(() => {
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  async function exportGif() {
    try {
      setBusy(true);
      setStatus('GIF生成を開始します…');

      const frames = Math.max(1, Math.round((durationMs / 1000) * fps));
      const delay = Math.round(1000 / fps); // ms/frame
      const c = canvasRef.current;
      const ctx = c.getContext('2d');

      // eslint-disable-next-line no-undef
      const gif = new window.GIF({
        workers: 2,
        quality: 10,
        workerScript: '/gif.worker.js',
        width,
        height,
        repeat: 0
      });

      for (let i = 0; i < frames; i++) {
        const prog = i / (frames - 1);
        drawFrame(ctx, prog);
        gif.addFrame(c, { copy: true, delay });
        if (i % Math.max(1, Math.floor(frames / 10)) === 0) {
          setStatus(`フレーム生成中… ${i + 1}/${frames}`);
        }
      }

      setStatus('エンコード中…');
      await new Promise((resolve, reject) => {
        gif.on('finished', (blob) => {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'tympanogram.gif';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          resolve();
        });
        gif.on('abort', () => reject(new Error('GIF encode aborted')));
        gif.render();
      });

      setStatus('完了');
    } catch (e) {
      console.error(e);
      setStatus('エラーが発生しました');
      alert('GIF生成でエラーが発生しました。ネットワーク接続をご確認ください。');
    } finally {
      setBusy(false);
      setTimeout(() => setStatus(''), 1500);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-lg font-semibold">Tympanogram GIF（-200〜+200 daPa / 0〜2.0 mL）</div>
        <div className="flex gap-2">
          <button
            onClick={playAnimation}
            disabled={isPlaying || busy}
            className={`px-3 py-2 rounded-xl text-white text-sm ${isPlaying || busy ? 'bg-gray-400' : 'bg-green-600 hover:bg-green-700'}`}
          >
            {isPlaying ? '再生中…' : '🔴 ティンパノ実施'}
          </button>
          <button
            onClick={exportGif}
            disabled={busy || isPlaying}
            className={`px-3 py-2 rounded-xl text-white text-sm ${busy || isPlaying ? 'bg-gray-400' : 'bg-blue-600 hover:bg-blue-700'}`}
          >
            {busy ? '生成中…' : 'GIFダウンロード'}
          </button>
        </div>
      </div>
      <canvas ref={canvasRef} width={width} height={height} style={{ width: `${width}px`, height: `${height}px`, borderRadius: 12, border: '1px solid #e5e7eb' }} />
      {status && <div className="text-sm text-gray-600">{status}</div>}
    </div>
  );
}



