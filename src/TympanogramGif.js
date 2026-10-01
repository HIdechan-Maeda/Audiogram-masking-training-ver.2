import React, { useEffect, useRef, useState } from 'react';
import { downloadCanvasJpeg } from './downloadCanvasJpeg';

// ティンパノグラム曲線を描画し、完成図を JPEG で保存する
// 仕様（デフォルト）: 800x600, 縦: 0-2.0 mL, 横: -200〜+200 daPa

export default function TympanogramGif({
  width = 800,
  height = 600,
  xMin = -200,
  xMax = 200,
  yMin = 0,
  yMax = 2.0,
  tympanogramData = null,
  durationMs = 5000,
  gridColor = '#e5e7eb',
  axisColor = '#9ca3af',
  bgColor = '#ffffff'
}) {
  const canvasRef = useRef(null);
  const [status, setStatus] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const animationRef = useRef(null);
  const audioContextRef = useRef(null);
  const oscillatorRef = useRef(null);
  const gainNodeRef = useRef(null);

  // スケール変換
  function xToPx(x) {
    const padL = 70, padR = 30;
    return padL + (Math.max(xMin, Math.min(xMax, x)) - xMin) * (width - padL - padR) / (xMax - xMin);
  }
  function yToPx(y) {
    const padT = 30, padB = 50;
    // 上が大きいmL、下が0
    const clampedY = Math.max(yMin, Math.min(effectiveYMax, y));
    const t = padT + (effectiveYMax - clampedY) * (height - padT - padB) / (effectiveYMax - yMin || 1);
    return t;
  }

  const effectiveYMax = (() => {
    if (!tympanogramData) return yMax;
    const gather = [];
    const pushVals = (ear) => {
      if (!ear) return;
      if (typeof ear.peakCompliance === 'number') gather.push(ear.peakCompliance);
    };
    pushVals(tympanogramData.left);
    pushVals(tympanogramData.right);
    const maxCompliance = gather.length ? Math.max(...gather) : yMax;
    if (maxCompliance > yMax) {
      return 5.0;
    }
    return yMax;
  })();

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
    for (let c = yMin; c <= effectiveYMax + 1e-6; c += 0.2) {
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
    ctx.lineTo(xToPx(0), yToPx(effectiveYMax));
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
    ctx.translate(18, (yToPx(effectiveYMax) + yToPx(yMin)) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText('Compliance (mL)', 0, 0);
    ctx.restore();
    ctx.textAlign = 'right';
    for (let c = yMin; c <= effectiveYMax + 1e-6; c += 0.5) {
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
        const y = getCompliance(x, leftData, tympanogramData.type, effectiveYMax);
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
        const y = getCompliance(x, rightData, tympanogramData.type, effectiveYMax);
        const px = xToPx(x);
        const py = yToPx(y);
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
  }

  function getCompliance(x, data, type, maxY) {
    // A型：peakPressure=0
    // B型：peakPressure=-200
    // C型：peakPressure=-100
    // すべてガウス関数で描画
    const mu = data.peakPressure;
    const A = data.peakCompliance;
    const s = data.sigma;
    const v = A * Math.exp(-Math.pow(x - mu, 2) / (2 * s * s));
    return Math.max(yMin, Math.min(maxY, v));
  }

  useEffect(() => {
    // 初期プレビュー描画（空白状態）
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    drawFrame(ctx, 0);
  }, [width, height, xMin, xMax, yMin, tympanogramData, effectiveYMax]);

  // 226 Hzの音を再生する関数
  function play226HzTone() {
    try {
      // AudioContextを初期化（既に存在する場合は再利用）
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }
      const audioContext = audioContextRef.current;
      
      // 既に再生中の場合は停止
      if (oscillatorRef.current) {
        oscillatorRef.current.stop();
        oscillatorRef.current = null;
      }
      
      // Oscillator（音源）を作成
      const oscillator = audioContext.createOscillator();
      oscillator.type = 'sine'; // サイン波
      oscillator.frequency.setValueAtTime(226, audioContext.currentTime); // 226 Hz
      
      // GainNode（音量調整）を作成
      const gainNode = audioContext.createGain();
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime); // 音量を30%に設定（大きすぎないように）
      
      // 接続
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      // 再生
      oscillator.start();
      oscillatorRef.current = oscillator;
      
      // アニメーション終了時に停止
      setTimeout(() => {
        if (oscillatorRef.current) {
          oscillatorRef.current.stop();
          oscillatorRef.current = null;
        }
      }, durationMs);
    } catch (error) {
      console.warn('音声再生に失敗しました（ユーザー操作が必要な場合があります）:', error);
    }
  }

  // 音を停止する関数
  function stop226HzTone() {
    if (oscillatorRef.current) {
      oscillatorRef.current.stop();
      oscillatorRef.current = null;
    }
  }

  // アニメーション再生
  function playAnimation() {
    setIsPlaying(true);
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    
    // 226 Hzの音を再生開始
    play226HzTone();
    
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
        stop226HzTone(); // アニメーション終了時に音を停止
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
      stop226HzTone(); // コンポーネントがアンマウントされる時に音を停止
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
      }
    };
  }, []);

  function exportJpeg() {
    try {
      const c = canvasRef.current;
      if (!c) return;
      drawFrame(c.getContext('2d'), 1);
      downloadCanvasJpeg(c, 'tympanogram.jpg');
      setStatus('JPEGを保存しました');
    } catch (e) {
      console.error(e);
      setStatus('エラーが発生しました');
    } finally {
      setTimeout(() => setStatus(''), 1500);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-lg font-semibold">ティンパノグラム（-200〜+200 daPa / 0〜2.0 mL）</div>
        <div className="flex gap-2">
          <button
            onClick={playAnimation}
            disabled={isPlaying}
            className={`px-3 py-2 rounded-xl text-white text-sm ${isPlaying ? 'bg-gray-400' : 'bg-green-600 hover:bg-green-700'}`}
          >
            {isPlaying ? '再生中…' : '🔴 ティンパノ実施'}
          </button>
          <button
            onClick={exportJpeg}
            disabled={isPlaying}
            className={`px-3 py-2 rounded-xl text-white text-sm ${isPlaying ? 'bg-gray-400' : 'bg-blue-600 hover:bg-blue-700'}`}
          >
            JPEGダウンロード
          </button>
        </div>
      </div>
      <canvas ref={canvasRef} width={width} height={height} style={{ width: `${width}px`, height: `${height}px`, borderRadius: 12, border: '1px solid #e5e7eb' }} />
      {status && <div className="text-sm text-gray-600">{status}</div>}
    </div>
  );
}



