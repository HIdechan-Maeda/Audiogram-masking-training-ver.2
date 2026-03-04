import React, { useEffect, useRef, useState } from 'react';

export default function StapedialReflexGif({
  width = 800,
  height = 900,
  durationMs = 17000,
  fps = 20,
  hearingConfig = null  // propsで受け取るART設定
}) {
  const canvasRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const animationRef = useRef(null);

  // デフォルト設定（症例H - 後方互換性のため）
  const DEFAULT_HEARING_CONFIG = {
    right: { 
      acThresholds: { 500: 10, 1000: 25, 2000: 30 },
      bcThresholds: { 500: 5, 1000: 30, 2000: 30 },
      tympanogramType: 'B',
      peakPressure: 100
    },
    left: { 
      acThresholds: { 500: 40, 1000: 50, 2000: 45 },
      bcThresholds: { 500: 15, 1000: 20, 2000: 25 },
      tympanogramType: 'A',
      peakPressure: 0
    }
  };

  // propsで渡された設定を使用、なければデフォルト
  const HEARING_CONFIG = hearingConfig || DEFAULT_HEARING_CONFIG;
  
  // デバッグログ
  if (hearingConfig) {
    console.log('StapedialReflexGif received hearingConfig:', JSON.stringify(hearingConfig, null, 2));
  }

  // 周波数ごとの正常反射閾値設定（文献値）
  const NORMAL_THRESHOLDS = {
    500: { ipsi: 80, cont: 85 },
    1000: { ipsi: 75, cont: 80 },
    2000: { ipsi: 80, cont: 85 }
  };

  // 反射閾値計算関数：BC値とティンパノグラム型を考慮
  const calculateThreshold = (freq, isIpsi, isLeft) => {
    const normal = NORMAL_THRESHOLDS[freq] || NORMAL_THRESHOLDS[1000];
    const normalThresh = isIpsi ? (normal?.ipsi ?? 80) : (normal?.cont ?? 85);
    
    // 測定側と刺激側の耳を特定（反射弓）
    // Rt測定: IPSI=右耳刺激、CONT=左耳刺激
    // Lt測定: IPSI=左耳刺激、CONT=右耳刺激
    const stimulusEar = (!isLeft && isIpsi) || (isLeft && !isIpsi) ? 'right' : 'left';
    const measuredEar = isLeft ? 'left' : 'right';
    
    const stimulusConfig = stimulusEar === 'right' ? HEARING_CONFIG.right : HEARING_CONFIG.left;
    const measuredConfig = measuredEar === 'right' ? HEARING_CONFIG.right : HEARING_CONFIG.left;
    
    const overrideKey = isIpsi ? 'ipsilateralOverride' : 'contralateralOverride';
    
    // 測定側のoverrideを優先的に確認（AOM症例などで正常側のCONT反射を上昇させる場合など）
    const overrideMeasured = measuredConfig?.[overrideKey]?.[freq];
    if (overrideMeasured !== undefined) {
      console.log(`ART override (measured): ${measuredEar} ${overrideKey}[${freq}] = ${overrideMeasured}`);
      return overrideMeasured;
    }

    // 刺激側のoverrideも確認
    const overrideStimulus = stimulusConfig?.[overrideKey]?.[freq];
    if (overrideStimulus !== undefined) {
      console.log(`ART override (stimulus): ${stimulusEar} ${overrideKey}[${freq}] = ${overrideStimulus}`);
      return overrideStimulus;
    }
    
    // overrideが設定されていない場合のみ、ティンパノグラム型で判定
    // 伝音障害の判定：ティンパノグラムB型は伝音障害を示す
    // 測定側が伝音障害（B型）なら反射消失
    if (measuredConfig.tympanogramType === 'B') {
      return 999; // 反射消失
    }
    
    // 刺激側が伝音障害（B型）なら反射消失
    // ただし、AOM症例などで正常側のCONT反射はoverrideで上昇させているため、
    // overrideが設定されていれば上記で既に返されている
    if (stimulusConfig.tympanogramType === 'B') {
      return 999; // 反射消失
    }
    
    // BC値（感音成分）を参照して反射閾値を計算
    const bcThreshold = stimulusConfig.bcThresholds[freq];
    
    // BC値が70dB以上（スケールアウト）なら反射消失
    if (bcThreshold >= 70) {
      return 999; // 反射消失
    }
    
    // BC値が正常（0dB程度）なら正常反射閾値
    if (bcThreshold <= 10) {
      return normalThresh;
    }
    
    // 感音難聴がある場合：BC値に基づいて反射閾値が上昇
    // 例：BC値60dB難聴で反射閾値が75dB→90dB（+15dB上昇）
    // 上昇量は難聴レベルに比例（約25%程度）
    const thresholdElevation = bcThreshold * 0.25; // BC値の25%が反射閾値上昇
    
    return normalThresh + thresholdElevation;
  };

  const FREQUENCIES = [500, 1000, 2000];

  const STIMULI = [
    { level: 70, startTime: 2, duration: 2 },
    { level: 80, startTime: 5, duration: 2 },
    { level: 90, startTime: 8, duration: 2 },
    { level: 100, startTime: 11, duration: 2 },
    { level: 110, startTime: 14, duration: 2 }
  ];

  const xMin = 0;
  const xMax = 17;
  const yMin = -0.7;
  const yMax = 0.7;
  const chartWidth = width / 2; // 左右2列
  const chartsPerFreq = 4; // 各周波数ごとに4チャート（Rt IPSI, Rt CONT, Lt IPSI, Lt CONT）
  const chartHeightPerFreq = height / (FREQUENCIES.length * 2); // 各周波数は上下2行

  const xToPx = (x, chartX) => {
    const padL = 50, padR = 15;
    const w = chartWidth - padL - padR;
    const offsetX = chartX * chartWidth;
    return offsetX + padL + (Math.max(xMin, Math.min(xMax, x)) - xMin) * w / (xMax - xMin);
  };
  
  const yToPx = (y, freqIdx, rowIdx) => {
    // freqIdx: 周波数のインデックス（0=500Hz, 1=1000Hz, 2=2000Hz）
    // rowIdx: 上下の行（0=IPSI, 1=CONT）
    const padT = 20, padB = 5;
    const h = chartHeightPerFreq - padT - padB;
    const offsetY = (freqIdx * 2 + rowIdx) * chartHeightPerFreq;
    const normalized = (yMax - y) / (yMax - yMin);
    return offsetY + padT + normalized * h;
  };

  // 決定論的ノイズ生成（時間ベース、±5%の揺らぎ）
  const getNoise = (time, chartId) => {
    const seed = (time * 100 + chartId * 17) % 1000;
    const noise = Math.sin(seed) * 0.4 + Math.sin(seed * 2.3) * 0.3 + Math.sin(seed * 5.7) * 0.3;
    return noise * 0.05 * 0.7;
  };

  const getComplianceAtTime = (time, useIpsi, freq, isLeft, chartId = 0) => {
    const activeStim = STIMULI.find(stim => {
      const endTime = stim.startTime + stim.duration;
      return time >= stim.startTime && time <= endTime;
    });

    if (!activeStim) {
      return getNoise(time, chartId);
    }

    // 動的に反射閾値を計算（聴力レベルに基づく）
    const threshold = calculateThreshold(freq, useIpsi, isLeft);
    
    // 閾値が999（反射消失）の場合は常にノイズのみ
    if (threshold >= 999 || activeStim.level < threshold) {
      return getNoise(time, chartId);
    }

    let maxChange;
    const excessOverThreshold = activeStim.level - threshold;
    if (excessOverThreshold < 10) {
      maxChange = 0.1;
    } else if (excessOverThreshold < 20) {
      maxChange = 0.3;
    } else {
      maxChange = 0.5;
    }

    const elapsed = time - activeStim.startTime;
    const transitionTime = 0.1;
    
    let baseline;
    if (elapsed <= transitionTime) {
      baseline = -maxChange * (elapsed / transitionTime);
    } else {
      baseline = -maxChange;
    }

    return baseline;
  };

  const drawFrame = (ctx, progress01) => {
    const currentTime = xMax * progress01;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    // 3周波数を縦に並べる（500Hz上、1000Hz中、2000Hz下）
    FREQUENCIES.forEach((freq, freqIdx) => {
      // 各周波数ごとに4チャート：左右（Rt/Lt）× 上下（IPSI/CONT）
      const charts = [
        { name: 'Rt IPSI', chartX: 0, rowIdx: 0, isLeft: false, isIpsi: true },
        { name: 'Rt CONT', chartX: 0, rowIdx: 1, isLeft: false, isIpsi: false },
        { name: 'Lt IPSI', chartX: 1, rowIdx: 0, isLeft: true, isIpsi: true },
        { name: 'Lt CONT', chartX: 1, rowIdx: 1, isLeft: true, isIpsi: false }
      ];

      charts.forEach((chart, chartIdx) => {
        const chartX = chart.chartX;
        const rowIdx = chart.rowIdx;
        const globalChartIdx = freqIdx * 4 + chartIdx;

        // カラー決定ロジック：Rt IPSI→赤、Rt CONT→青、Lt IPSI→青、Lt CONT→赤
        const color = (chart.isIpsi && !chart.isLeft) || (!chart.isIpsi && chart.isLeft) ? '#ef4444' : '#3b82f6';
        const bgColor = (chart.isIpsi && !chart.isLeft) || (!chart.isIpsi && chart.isLeft) ? 'rgba(239, 68, 68, 0.1)' : 'rgba(59, 130, 246, 0.1)';

        // 周波数ラベル（IPSI行の左側に表示）
        if (rowIdx === 0 && chartX === 0) {
          ctx.fillStyle = '#111827';
          ctx.font = 'bold 10px system-ui';
          ctx.textAlign = 'left';
          const labelY = yToPx(yMax, freqIdx, 0);
          ctx.fillText(`${freq}Hz`, xToPx(xMin, chartX) - 40, labelY);
        }

        // グリッド
        ctx.strokeStyle = '#e5e7eb';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let t = xMin; t <= xMax; t += 1) {
          const x = xToPx(t, chartX);
          ctx.moveTo(x, yToPx(yMin, freqIdx, rowIdx));
          ctx.lineTo(x, yToPx(yMax, freqIdx, rowIdx));
        }
        for (let c = yMin; c <= yMax + 1e-6; c += 0.2) {
          const y = yToPx(c, freqIdx, rowIdx);
          ctx.moveTo(xToPx(xMin, chartX), y);
          ctx.lineTo(xToPx(xMax, chartX), y);
        }
        ctx.stroke();

        // 軸
        ctx.strokeStyle = '#9ca3af';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(xToPx(xMin, chartX), yToPx(0, freqIdx, rowIdx));
        ctx.lineTo(xToPx(xMax, chartX), yToPx(0, freqIdx, rowIdx));
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(xToPx(xMin, chartX), yToPx(yMin, freqIdx, rowIdx));
        ctx.lineTo(xToPx(xMin, chartX), yToPx(yMax, freqIdx, rowIdx));
        ctx.stroke();

        // 目盛・ラベル
        ctx.fillStyle = '#111827';
        ctx.font = '8px system-ui';
        ctx.textAlign = 'center';
        // 最下行のみ時間ラベルを表示
        if (freqIdx === FREQUENCIES.length - 1 && rowIdx === 1) {
          for (let t = 0; t <= xMax; t += 2) {
            const x = xToPx(t, chartX);
            ctx.fillText(`${t}s`, x, yToPx(0, freqIdx, rowIdx) + 12);
          }
        }

        ctx.textAlign = 'right';
        // 左列のみ縦軸ラベルを表示
        if (chartX === 0) {
          for (let c = -0.6; c <= 0.6 + 1e-6; c += 0.2) {
            const y = yToPx(c, freqIdx, rowIdx);
            ctx.fillText(`${c.toFixed(1)}`, xToPx(xMin, chartX) - 3, y + 2);
          }
        }

        ctx.textAlign = 'left';
        ctx.font = 'bold 9px system-ui';
        ctx.fillText(chart.name, xToPx(xMin, chartX) + 3, yToPx(yMax, freqIdx, rowIdx) - 2);

        // 曲線を描画
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.beginPath();

        const steps = 170;
        for (let i = 0; i <= steps; i++) {
          const t = (i / steps) * xMax;
          if (t <= currentTime) {
            const compliance = getComplianceAtTime(t, chart.isIpsi, freq, chart.isLeft, globalChartIdx);
            const x = xToPx(t, chartX);
            const y = yToPx(compliance, freqIdx, rowIdx);
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          }
        }
        ctx.stroke();

        // 刺激背景
        for (const stim of STIMULI) {
          if (stim.startTime <= currentTime) {
            const x1 = xToPx(stim.startTime, chartX);
            const x2 = xToPx(Math.min(stim.startTime + stim.duration, currentTime), chartX);
            ctx.fillStyle = bgColor;
            ctx.fillRect(x1, yToPx(yMax, freqIdx, rowIdx), x2 - x1, yToPx(yMin, freqIdx, rowIdx) - yToPx(yMax, freqIdx, rowIdx));
          }
        }

        // 刺激レベルラベル（全チャートに表示）
        ctx.fillStyle = '#666';
        ctx.font = '8px system-ui';
        ctx.textAlign = 'center';
        for (const stim of STIMULI) {
          if (stim.startTime <= currentTime) {
            const x = xToPx(stim.startTime + stim.duration / 2, chartX);
            ctx.fillText(`${stim.level}dB`, x, yToPx(yMax, freqIdx, rowIdx) + 10);
          }
        }
      });
    });

    ctx.textAlign = 'center';
    ctx.font = '10px system-ui';
    ctx.fillStyle = '#111827';
    ctx.fillText('時間 (秒)', width / 2, height - 5);
  };

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    drawFrame(ctx, 0);
  }, [width, height]);

  const playAnimation = () => {
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
  };

  useEffect(() => {
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  const exportGif = async () => {
    try {
      setBusy(true);
      setStatus('GIF生成を開始します…');

      const frames = Math.max(1, Math.round((durationMs / 1000) * fps));
      const delay = Math.round(1000 / fps);
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
          a.download = 'stapedial_reflex.gif';
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
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-lg font-semibold">あぶみ骨筋反射検査</div>
        <div className="flex gap-2">
          <button
            onClick={playAnimation}
            disabled={isPlaying || busy}
            className={`px-3 py-2 rounded-xl text-white text-sm ${isPlaying || busy ? 'bg-gray-400' : 'bg-green-600 hover:bg-green-700'}`}
          >
            {isPlaying ? '再生中…' : '🔴 反射検査実施'}
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
