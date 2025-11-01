import React, { useEffect, useRef, useState } from 'react';

// DPOAE DP-gramグラフコンポーネント（GIF生成対応）
// 仕様: X軸=f2周波数（kHz、0-8kHz）、Y軸=DPOAEレベル（dB SPL、0-30dB）
// 左右の耳を表示（右：赤、左：青）
// 1kHzから順番に測定していくアニメーション

export default function DPOAE({
  width = 1000,
  height = 600,
  xMin = 0,
  xMax = 8,
  yMin = 0,
  yMax = 30,
  dpoaeData = null,  // { left: [周波数ごとのDPOAEレベル配列], right: [周波数ごとのDPOAEレベル配列] }
  noiseFloor = true,  // ノイズフロアを表示するか
  bgColor = '#ffffff',
  durationMs = 10000,  // アニメーション時間（ミリ秒）
  fps = 20  // フレームレート
}) {
  const canvasRefRight = useRef(null);
  const canvasRefLeft = useRef(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [animationComplete, setAnimationComplete] = useState(false);
  const [measuredCount, setMeasuredCount] = useState(0); // 測定済みの周波数数
  const animationRef = useRef(null);
  const audioContextRef = useRef(null);
  const audioNodesRef = useRef([]);

  // 測定周波数（f2、kHz）
  const frequencies = [1, 2, 3, 4, 6, 8];
  
  // 音声生成・再生用
  const initializeAudioContext = () => {
    if (!audioContextRef.current) {
      try {
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      } catch (e) {
        console.error('AudioContext初期化エラー:', e);
        return null;
      }
    }
    return audioContextRef.current;
  };

  // 純音を生成して再生
  const playTone = (freq, duration, volume = 0.3) => {
    const ctx = initializeAudioContext();
    if (!ctx) return null;

    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.frequency.value = freq;
    oscillator.type = 'sine';

    // フェードイン/アウトでクリック音を防ぐ
    const now = ctx.currentTime;
    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(volume, now + 0.01);
    gainNode.gain.linearRampToValueAtTime(0, now + duration - 0.01);

    oscillator.start(now);
    oscillator.stop(now + duration);

    return { oscillator, gainNode };
  };

  // f1とf2の2つの純音を同時に再生
  const playDPOAETones = (f2Freq, duration = 0.5, volume = 0.2) => {
    const f1Freq = f2Freq / 1.22; // f2/f1 = 1.22 より f1 = f2 / 1.22
    const nodes = [];
    
    // f1を再生
    const node1 = playTone(f1Freq * 1000, duration, volume);
    if (node1) nodes.push(node1);
    
    // f2を再生
    const node2 = playTone(f2Freq * 1000, duration, volume);
    if (node2) nodes.push(node2);
    
    return nodes;
  };

  // ノイズフロア（typical noisy conditionの範囲の中間値を使用）
  // 1 kHz: 12–22 dB SPL → 平均約17 dB SPL
  // 2 kHz: 10–20 dB SPL → 平均約15 dB SPL
  // 3 kHz: 8–18 dB SPL → 平均約13 dB SPL
  // 4 kHz: 7–16 dB SPL → 平均約11.5 dB SPL
  // 6 kHz: 6–14 dB SPL → 平均約10 dB SPL
  // 8 kHz: 6–14 dB SPL → 平均約10 dB SPL
  const getNoiseFloor = (freq) => {
    // 周波数ごとの基本ノイズフロア値（範囲の中間値）
    const baseValues = {
      1: 17,   // 12-22 の中央値
      2: 15,   // 10-20 の中央値
      3: 13,   // 8-18 の中央値
      4: 11.5, // 7-16 の中央値
      6: 10,   // 6-14 の中央値
      8: 10    // 6-14 の中央値
    };
    
    // 最も近い周波数を見つける
    let closestFreq = frequencies.reduce((prev, curr) => 
      Math.abs(curr - freq) < Math.abs(prev - freq) ? curr : prev
    );
    
    let base = baseValues[closestFreq];
    
    // 線形補間（周波数間を滑らかに接続）
    if (freq !== closestFreq) {
      const sortedFreqs = [...frequencies].sort((a, b) => a - b);
      let lower = null, upper = null;
      for (let i = 0; i < sortedFreqs.length; i++) {
        if (sortedFreqs[i] <= freq && (i === sortedFreqs.length - 1 || sortedFreqs[i + 1] > freq)) {
          lower = sortedFreqs[i];
          upper = i < sortedFreqs.length - 1 ? sortedFreqs[i + 1] : lower;
          break;
        }
      }
      if (lower !== null && upper !== null && lower !== upper) {
        const lowerBase = baseValues[lower] || baseValues[closestFreq];
        const upperBase = baseValues[upper] || baseValues[closestFreq];
        const t = (freq - lower) / (upper - lower);
        base = lowerBase + (upperBase - lowerBase) * t;
      }
    }
    
    // デターミニスティックな変動パターン（周波数に基づく）
    // 範囲内で変動（約±3-5dB程度）
    const variation = Math.sin(freq * 2.5) * 2.5 + Math.cos(freq * 1.7) * 1.5;
    
    // 範囲内にクランプ
    const rangeMin = {
      1: 12, 2: 10, 3: 8, 4: 7, 6: 6, 8: 6
    };
    const rangeMax = {
      1: 22, 2: 20, 3: 18, 4: 16, 6: 14, 8: 14
    };
    const minFreq = Object.keys(rangeMin).reduce((prev, curr) => 
      Math.abs(curr - freq) < Math.abs(prev - freq) ? curr : prev
    );
    const maxFreq = Object.keys(rangeMax).reduce((prev, curr) => 
      Math.abs(curr - freq) < Math.abs(prev - freq) ? curr : prev
    );
    
    return Math.max(rangeMin[minFreq], Math.min(rangeMax[maxFreq], base + variation));
  };
  
  // デフォルトの正常パターン（ノイズフロア + SNR 6〜12dB）
  // 正常な外有毛細胞（OHC）機能では、DPOAEレベル ≈ NoiseFloor + 6〜12 dB
  // 絶対値ではなくSNRの確保が本質的
  // dpoaeDataが提供されている場合はそれを使用（症例データ）、そうでなければデフォルト
  const data = dpoaeData || (() => {
    // デフォルトの正常パターン（開発・テスト用）
    const right = frequencies.map((freq) => {
      const noiseFloor = getNoiseFloor(freq);
      // SNR 6〜12dBの範囲から適切な値を選択（中間〜やや高め）
      // 周波数に応じたバリエーション（2kHz付近が最大反応帯）
      let snrOffset = 9; // 基本SNR（6〜12の中間）
      if (freq === 2) {
        snrOffset = 10; // 2kHzは最大反応帯なのでやや高いSNR
      } else if (freq >= 6) {
        snrOffset = 7; // 高周波はやや低め
      }
      return noiseFloor + snrOffset;
    });
    
    return {
      right,
      left: [...right] // 左右同じパターン（デフォルト）
    };
  })();

  // 各グラフの幅（左右に分割）
  const chartWidth = width / 2;

  // スケール変換
  function xToPx(x, chartWidth) {
    const padL = 80, padR = 40;
    return padL + (Math.max(xMin, Math.min(xMax, x)) - xMin) * (chartWidth - padL - padR) / (xMax - xMin);
  }

  function yToPx(y) {
    const padT = 40, padB = 60;
    // 上が大きいdB（35）、下が0
    const t = padT + (yMax - Math.max(yMin, Math.min(yMax, y))) * (height - padT - padB) / (yMax - yMin);
    return t;
  }

  function drawFrame(ctx, ear, chartWidth, progress = 1) {
    // 背景
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, chartWidth, height);

    // グリッド（X軸: 1kHz刻み、Y軸: 5dB刻み）
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let f = xMin; f <= xMax; f += 1) {
      const x = xToPx(f, chartWidth);
      ctx.moveTo(x, yToPx(yMin));
      ctx.lineTo(x, yToPx(yMax));
    }
    for (let d = yMin; d <= yMax; d += 5) {
      const y = yToPx(d);
      ctx.moveTo(xToPx(xMin, chartWidth), y);
      ctx.lineTo(xToPx(xMax, chartWidth), y);
    }
    ctx.stroke();

    // 軸
    ctx.strokeStyle = '#9ca3af';
    ctx.lineWidth = 2;
    // X軸
    ctx.beginPath();
    ctx.moveTo(xToPx(xMin, chartWidth), yToPx(0));
    ctx.lineTo(xToPx(xMax, chartWidth), yToPx(0));
    ctx.stroke();
    // Y軸
    ctx.beginPath();
    ctx.moveTo(xToPx(xMin, chartWidth), yToPx(yMin));
    ctx.lineTo(xToPx(xMin, chartWidth), yToPx(yMax));
    ctx.stroke();

    // 目盛・ラベル
    ctx.fillStyle = '#111827';
    ctx.font = '14px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial';
    ctx.textAlign = 'center';
    // X軸ラベル
    for (let f = xMin; f <= xMax; f += 1) {
      const x = xToPx(f, chartWidth);
      ctx.fillText(`${f}`, x, yToPx(0) + 20);
    }
    ctx.textAlign = 'center';
    ctx.fillText('f2 Frequency (kHz)', (xToPx(xMin, chartWidth) + xToPx(xMax, chartWidth)) / 2, height - 16);

    // Y軸ラベル
    ctx.save();
    ctx.translate(20, (yToPx(yMax) + yToPx(yMin)) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText('DPOAE Level (dB SPL)', 0, 0);
    ctx.restore();
    ctx.textAlign = 'right';
    for (let d = yMin; d <= yMax; d += 5) {
      const y = yToPx(d);
      ctx.fillText(`${d}`, xToPx(xMin, chartWidth) - 8, y + 4);
    }

    // 測定済みの周波数インデックスを計算（progressに基づく）
    // 6つの周波数があるので、各周波数に約16.67% (1/6)のprogressを割り当て
    const numFrequencies = frequencies.length;
    const measuredCount = Math.min(numFrequencies, Math.ceil(progress * numFrequencies));
    
    // ノイズフロア（オレンジ色、実臨床ぽく変動を持たせる）
    if (noiseFloor && measuredCount > 0) {
      // dpoaeDataにノイズフロア情報が含まれている場合はそれを使用
      const hasNoiseFloorData = dpoaeData && dpoaeData.noiseFloor;
      
      ctx.strokeStyle = '#f97316';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      // 測定済みの周波数まで描画
      for (let i = 0; i < measuredCount; i++) {
        const freq = frequencies[i];
        // dpoaeDataにノイズフロア情報がある場合はそれを使用、なければgetNoiseFloorで計算
        const nf = hasNoiseFloorData 
          ? dpoaeData.noiseFloor[ear][i]
          : getNoiseFloor(freq);
        const x = xToPx(freq, chartWidth);
        const y = yToPx(nf);
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          // 前のポイントとの間を滑らかに補間
          const prevFreq = frequencies[i - 1];
          const prevNf = hasNoiseFloorData
            ? dpoaeData.noiseFloor[ear][i - 1]
            : getNoiseFloor(prevFreq);
          const prevX = xToPx(prevFreq, chartWidth);
          const prevY = yToPx(prevNf);
          
          // ベジェ曲線で滑らかに接続（中間点でより自然な変動）
          const midFreq = (prevFreq + freq) / 2;
          const midNf = hasNoiseFloorData
            ? (prevNf + nf) / 2  // 中間値を使用
            : getNoiseFloor(midFreq);
          const midX = xToPx(midFreq, chartWidth);
          const midY = yToPx(midNf);
          
          ctx.quadraticCurveTo(midX, midY, x, y);
        }
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // DPOAEデータを描画（指定された耳のみ、測定済みの周波数まで）
    const colors = {
      right: '#ef4444',  // 赤
      left: '#3b82f6'    // 青
    };

    if (!data[ear] || data[ear].length !== frequencies.length) return;

    const color = colors[ear];
    
    if (measuredCount === 0) return;
    
    // 線を描画（測定済みの周波数まで）
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let i = 0; i < measuredCount; i++) {
      const freq = frequencies[i];
      const level = data[ear][i];
      const x = xToPx(freq, chartWidth);
      const y = yToPx(level);
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();

    // マーカーを描画（測定済みの周波数まで）
    ctx.fillStyle = color;
    for (let i = 0; i < measuredCount; i++) {
      const freq = frequencies[i];
      const level = data[ear][i];
      const x = xToPx(freq, chartWidth);
      const y = yToPx(level);
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fill();
    }

    // タイトル（耳の表示）
    ctx.font = '16px system-ui';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#111827';
    const earLabel = ear === 'right' ? 'Right Ear' : 'Left Ear';
    ctx.fillText(earLabel, chartWidth / 2, 20);

    // 凡例
    ctx.font = '12px system-ui';
    ctx.textAlign = 'left';
    const legendY = yToPx(yMax) - 10;
    // 凡例を左側から配置（グラフ幅が狭いので左側に配置）
    let legendX = 20;

    // 現在の耳の色
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(legendX, legendY, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#111827';
    ctx.fillText(ear === 'right' ? 'Rt DPOAE' : 'Lt DPOAE', legendX + 12, legendY + 4);

    // Noise floor
    if (noiseFloor) {
      legendX += 70;
      ctx.strokeStyle = '#f97316';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(legendX, legendY);
      ctx.lineTo(legendX + 20, legendY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#111827';
      ctx.fillText('Noise Floor', legendX + 25, legendY + 4);
    }
  }

  useEffect(() => {
    // 初期プレビュー描画（空白状態）
    const canvasRight = canvasRefRight.current;
    const canvasLeft = canvasRefLeft.current;
    if (!canvasRight || !canvasLeft) return;
    const ctxRight = canvasRight.getContext('2d');
    const ctxLeft = canvasLeft.getContext('2d');
    const progress = animationComplete ? 1 : (measuredCount / frequencies.length);
    drawFrame(ctxRight, 'right', chartWidth, progress);
    drawFrame(ctxLeft, 'left', chartWidth, progress);
  }, [width, height, xMin, xMax, yMin, yMax, data, noiseFloor, chartWidth, animationComplete, measuredCount]);

  // アニメーション再生
  function playAnimation() {
    setIsPlaying(true);
    setAnimationComplete(false); // アニメーション開始時にリセット
    setMeasuredCount(0); // 測定済み周波数をリセット
    
    // 既存の音声を停止
    stopAllSounds();
    
    const canvasRight = canvasRefRight.current;
    const canvasLeft = canvasRefLeft.current;
    if (!canvasRight || !canvasLeft) return;
    const ctxRight = canvasRight.getContext('2d');
    const ctxLeft = canvasLeft.getContext('2d');
    
    // 各周波数に割り当てる時間（ミリ秒）
    const timePerFrequency = durationMs / frequencies.length;
    
    let startTime = null;
    let lastFrequencyIndex = -1;
    
    const animate = (timestamp) => {
      if (!startTime) {
        startTime = timestamp;
        // AudioContextを初期化（ユーザー操作後に）
        initializeAudioContext();
      }
      const elapsed = timestamp - startTime;
      const progress = Math.min(elapsed / durationMs, 1);
      
      // 現在の周波数インデックスを計算
      const currentFrequencyIndex = Math.min(
        frequencies.length - 1,
        Math.floor(elapsed / timePerFrequency)
      );
      
      // 新しい周波数が開始されたら音を再生
      if (currentFrequencyIndex > lastFrequencyIndex && audioContextRef.current) {
        const f2Freq = frequencies[currentFrequencyIndex];
        const nodes = playDPOAETones(f2Freq, 0.3, 0.15);
        audioNodesRef.current.push(...nodes);
        
        // 周波数が切り替わった瞬間に、前の周波数の測定完了として更新
        // 最初の周波数（index 0）が開始されたら、測定済みは1にする
        // 2番目の周波数（index 1）が開始されたら、最初の周波数（index 0）が測定完了で、測定済みは2
        if (currentFrequencyIndex === 0) {
          // 最初の周波数が開始されたら、少し遅延させてから測定済みとして表示
          setTimeout(() => {
            setMeasuredCount(1);
          }, timePerFrequency * 0.8); // 80%経過したら測定完了として表示
        } else {
          // 前の周波数の測定が完了
          setMeasuredCount(currentFrequencyIndex);
        }
        
        lastFrequencyIndex = currentFrequencyIndex;
      }
      
      // 最後の周波数の測定が進んでいる場合
      if (currentFrequencyIndex === frequencies.length - 1 && elapsed >= (frequencies.length - 1) * timePerFrequency + timePerFrequency * 0.8) {
        // 最後の周波数も測定がほぼ完了したら更新
        setMeasuredCount(frequencies.length);
      }
      
      drawFrame(ctxRight, 'right', chartWidth, progress);
      drawFrame(ctxLeft, 'left', chartWidth, progress);
      
      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      } else {
        // 終了時に完全な描画（progress = 1）を確実に表示
        drawFrame(ctxRight, 'right', chartWidth, 1);
        drawFrame(ctxLeft, 'left', chartWidth, 1);
        setMeasuredCount(frequencies.length); // 全ての周波数を測定済みに
        setIsPlaying(false);
        setAnimationComplete(true); // アニメーション完了状態を保持
        // 少し遅延させてから音声ノードをクリア
        setTimeout(() => {
          audioNodesRef.current = [];
        }, 500);
      }
    };
    
    animationRef.current = requestAnimationFrame(animate);
  }

  // 全ての音声を停止
  const stopAllSounds = () => {
    audioNodesRef.current.forEach(node => {
      try {
        if (node.oscillator) {
          node.oscillator.stop();
          node.oscillator.disconnect();
        }
        if (node.gainNode) {
          node.gainNode.disconnect();
        }
      } catch (e) {
        // 既に停止している場合はエラーを無視
      }
    });
    audioNodesRef.current = [];
    
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
    setIsPlaying(false);
  };

  // クリーンアップ
  useEffect(() => {
    return () => {
      stopAllSounds();
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(() => {});
      }
    };
  }, []);

  async function exportGif() {
    try {
      setBusy(true);
      setStatus('GIF生成を開始します…');

      const frames = Math.max(1, Math.round((durationMs / 1000) * fps));
      const delay = Math.round(1000 / fps); // ms/frame
      const canvasRight = canvasRefRight.current;
      const canvasLeft = canvasRefLeft.current;
      
      if (!canvasRight || !canvasLeft) {
        throw new Error('Canvas not found');
      }

      // 結合キャンバスを作成（左右を並べる）
      const combinedWidth = width;
      const combinedHeight = height;
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = combinedWidth;
      tempCanvas.height = combinedHeight;
      const tempCtx = tempCanvas.getContext('2d');

      // eslint-disable-next-line no-undef
      const gif = new window.GIF({
        workers: 2,
        quality: 10,
        workerScript: '/gif.worker.js',
        width: combinedWidth,
        height: combinedHeight,
        repeat: 0
      });

      for (let i = 0; i < frames; i++) {
        const prog = i / (frames - 1);
        // 各キャンバスに描画
        drawFrame(canvasRight.getContext('2d'), 'right', chartWidth, prog);
        drawFrame(canvasLeft.getContext('2d'), 'left', chartWidth, prog);
        
        // 結合キャンバスに左右を描画
        tempCtx.fillStyle = bgColor;
        tempCtx.fillRect(0, 0, combinedWidth, combinedHeight);
        tempCtx.drawImage(canvasRight, 0, 0);
        tempCtx.drawImage(canvasLeft, chartWidth, 0);
        
        gif.addFrame(tempCanvas, { copy: true, delay });
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
          a.download = 'dpoae.gif';
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

  // 判定ロジック：SNR = DPOAEレベル - Noise Floorレベル
  // 各周波数帯域（bands）で SNR[band] = DPOAE_dB[band] - NoiseFloor_dB[band] を計算
  // PASS基準：count(SNR >= 6 dB) >= 4 → PASS、それ以外 → REFER
  // measuredCount: 測定済みの周波数数（順次表示用）
  const evaluateResults = (currentMeasuredCount = measuredCount) => {
    const results = { right: [], left: [] };
    const overallResults = { right: null, left: null };
    
    // dpoaeDataにノイズフロア情報が含まれている場合はそれを使用
    const hasNoiseFloorData = dpoaeData && dpoaeData.noiseFloor;
    
    ['right', 'left'].forEach((ear) => {
      if (!data[ear] || data[ear].length !== frequencies.length) return;
      
      // 測定済みの周波数のみでSNRを計算
      const freqResults = frequencies.slice(0, currentMeasuredCount).map((freq, index) => {
        const dpoaeLevel = data[ear][index];
        // dpoaeDataにノイズフロア情報がある場合はそれを使用、なければgetNoiseFloorで計算
        const noiseFloorLevel = hasNoiseFloorData 
          ? dpoaeData.noiseFloor[ear][index]
          : getNoiseFloor(freq);
        const snr = dpoaeLevel - noiseFloorLevel;  // SNR[band] = DPOAE_dB[band] - NoiseFloor_dB[band]
        const isPass = snr >= 6;  // SNR ≥ 6 dB
        
        return {
          frequency: freq,
          dpoaeLevel,
          noiseFloor: noiseFloorLevel,
          snr,
          isPass
        };
      });
      
      results[ear] = freqResults;
      
      // 全体判定は全ての周波数が測定済みの場合のみ表示
      if (currentMeasuredCount >= frequencies.length) {
        // 全ての周波数でSNRを計算（全体判定用）
        const allFreqResults = frequencies.map((freq, index) => {
          const dpoaeLevel = data[ear][index];
          const noiseFloorLevel = hasNoiseFloorData 
            ? dpoaeData.noiseFloor[ear][index]
            : getNoiseFloor(freq);
          const snr = dpoaeLevel - noiseFloorLevel;
          const isPass = snr >= 6;
          return { isPass };
        });
        
        // PASS判定：count(SNR >= 6 dB) >= 4
        const passCount = allFreqResults.filter(r => r.isPass).length;
        overallResults[ear] = {
          passCount,
          totalCount: allFreqResults.length,
          overallResult: passCount >= 4 ? 'PASS' : 'REFER'
        };
      }
    });
    
    return { frequencyResults: results, overallResults };
  };

  const evaluationResults = evaluateResults(measuredCount);

  return (
    <div style={{ padding: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h2 style={{ fontSize: '20px', margin: 0, color: '#1f2937' }}>
          DPOAE DP-gram
        </h2>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          {status && (
            <span style={{ fontSize: '14px', color: '#6b7280' }}>{status}</span>
          )}
          <button
            onClick={playAnimation}
            disabled={isPlaying || busy}
            style={{
              padding: '8px 16px',
              borderRadius: '6px',
              border: 'none',
              backgroundColor: isPlaying || busy ? '#d1d5db' : '#3b82f6',
              color: 'white',
              cursor: isPlaying || busy ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              fontWeight: '500'
            }}
          >
            {isPlaying ? '再生中...' : 'アニメーション再生'}
          </button>
          <button
            onClick={exportGif}
            disabled={busy}
            style={{
              padding: '8px 16px',
              borderRadius: '6px',
              border: 'none',
              backgroundColor: busy ? '#d1d5db' : '#10b981',
              color: 'white',
              cursor: busy ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              fontWeight: '500'
            }}
          >
            {busy ? '生成中...' : 'GIFダウンロード'}
          </button>
        </div>
      </div>
      <div style={{ display: 'flex', gap: '20px', marginBottom: '24px' }}>
        {/* Right Ear */}
        <div style={{ flex: 1 }}>
          <canvas
            ref={canvasRefRight}
            width={chartWidth}
            height={height}
            style={{ border: '1px solid #d1d5db', borderRadius: '8px', display: 'block' }}
          />
        </div>
        {/* Left Ear */}
        <div style={{ flex: 1 }}>
          <canvas
            ref={canvasRefLeft}
            width={chartWidth}
            height={height}
            style={{ border: '1px solid #d1d5db', borderRadius: '8px', display: 'block' }}
          />
        </div>
      </div>
      
      {/* 判定結果テーブル */}
      <div style={{ marginTop: '24px' }}>
        <h3 style={{ fontSize: '18px', marginBottom: '16px', color: '#1f2937' }}>
          判定結果（基準: 6つ中4つ以上でSNR ≥ 6 dB）
        </h3>
        <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '16px' }}>
          SNR = DPOAEレベル - Noise Floorレベル | 6つの周波数帯域のうち4つ以上でSNR ≥ 6 dB → PASS、それ以外 → REFER
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          {/* Right Ear */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h4 style={{ fontSize: '16px', color: '#ef4444', fontWeight: 'bold', margin: 0 }}>
                Right Ear
              </h4>
              {evaluationResults.overallResults.right && (
                <span style={{ 
                  color: evaluationResults.overallResults.right.overallResult === 'PASS' ? '#10b981' : '#ef4444',
                  backgroundColor: evaluationResults.overallResults.right.overallResult === 'PASS' ? '#d1fae5' : '#fee2e2',
                  padding: '6px 16px',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: 'bold'
                }}>
                  全体判定: {evaluationResults.overallResults.right.overallResult} 
                  ({evaluationResults.overallResults.right.passCount}/{evaluationResults.overallResults.right.totalCount})
                </span>
              )}
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #d1d5db', borderRadius: '8px', overflow: 'hidden' }}>
              <thead>
                <tr style={{ backgroundColor: '#f9fafb' }}>
                  <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1px solid #d1d5db', fontSize: '14px' }}>f2 (kHz)</th>
                  <th style={{ padding: '10px', textAlign: 'center', borderBottom: '1px solid #d1d5db', fontSize: '14px' }}>DPOAE (dB)</th>
                  <th style={{ padding: '10px', textAlign: 'center', borderBottom: '1px solid #d1d5db', fontSize: '14px' }}>NF (dB)</th>
                  <th style={{ padding: '10px', textAlign: 'center', borderBottom: '1px solid #d1d5db', fontSize: '14px' }}>SNR (dB)</th>
                  <th style={{ padding: '10px', textAlign: 'center', borderBottom: '1px solid #d1d5db', fontSize: '14px' }}>判定</th>
                </tr>
              </thead>
              <tbody>
                {evaluationResults.frequencyResults.right.map((result, index) => (
                  <tr key={index} style={{ borderBottom: index < evaluationResults.frequencyResults.right.length - 1 ? '1px solid #f3f4f6' : 'none' }}>
                    <td style={{ padding: '10px', fontSize: '14px' }}>{result.frequency}</td>
                    <td style={{ padding: '10px', textAlign: 'center', fontSize: '14px', fontFamily: 'monospace' }}>
                      {result.dpoaeLevel.toFixed(1)}
                    </td>
                    <td style={{ padding: '10px', textAlign: 'center', fontSize: '14px', fontFamily: 'monospace' }}>
                      {result.noiseFloor.toFixed(1)}
                    </td>
                    <td style={{ padding: '10px', textAlign: 'center', fontSize: '14px', fontFamily: 'monospace', fontWeight: 'bold' }}>
                      {result.snr.toFixed(1)}
                    </td>
                    <td style={{ padding: '10px', textAlign: 'center', fontSize: '14px', fontWeight: 'bold' }}>
                      <span style={{ 
                        color: result.isPass ? '#10b981' : '#ef4444',
                        backgroundColor: result.isPass ? '#d1fae5' : '#fee2e2',
                        padding: '4px 12px',
                        borderRadius: '4px'
                      }}>
                        {result.isPass ? 'PASS' : 'REFER'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Left Ear */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h4 style={{ fontSize: '16px', color: '#3b82f6', fontWeight: 'bold', margin: 0 }}>
                Left Ear
              </h4>
              {evaluationResults.overallResults.left && (
                <span style={{ 
                  color: evaluationResults.overallResults.left.overallResult === 'PASS' ? '#10b981' : '#ef4444',
                  backgroundColor: evaluationResults.overallResults.left.overallResult === 'PASS' ? '#d1fae5' : '#fee2e2',
                  padding: '6px 16px',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: 'bold'
                }}>
                  全体判定: {evaluationResults.overallResults.left.overallResult} 
                  ({evaluationResults.overallResults.left.passCount}/{evaluationResults.overallResults.left.totalCount})
                </span>
              )}
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #d1d5db', borderRadius: '8px', overflow: 'hidden' }}>
              <thead>
                <tr style={{ backgroundColor: '#f9fafb' }}>
                  <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1px solid #d1d5db', fontSize: '14px' }}>f2 (kHz)</th>
                  <th style={{ padding: '10px', textAlign: 'center', borderBottom: '1px solid #d1d5db', fontSize: '14px' }}>DPOAE (dB)</th>
                  <th style={{ padding: '10px', textAlign: 'center', borderBottom: '1px solid #d1d5db', fontSize: '14px' }}>NF (dB)</th>
                  <th style={{ padding: '10px', textAlign: 'center', borderBottom: '1px solid #d1d5db', fontSize: '14px' }}>SNR (dB)</th>
                  <th style={{ padding: '10px', textAlign: 'center', borderBottom: '1px solid #d1d5db', fontSize: '14px' }}>判定</th>
                </tr>
              </thead>
              <tbody>
                {evaluationResults.frequencyResults.left.map((result, index) => (
                  <tr key={index} style={{ borderBottom: index < evaluationResults.frequencyResults.left.length - 1 ? '1px solid #f3f4f6' : 'none' }}>
                    <td style={{ padding: '10px', fontSize: '14px' }}>{result.frequency}</td>
                    <td style={{ padding: '10px', textAlign: 'center', fontSize: '14px', fontFamily: 'monospace' }}>
                      {result.dpoaeLevel.toFixed(1)}
                    </td>
                    <td style={{ padding: '10px', textAlign: 'center', fontSize: '14px', fontFamily: 'monospace' }}>
                      {result.noiseFloor.toFixed(1)}
                    </td>
                    <td style={{ padding: '10px', textAlign: 'center', fontSize: '14px', fontFamily: 'monospace', fontWeight: 'bold' }}>
                      {result.snr.toFixed(1)}
                    </td>
                    <td style={{ padding: '10px', textAlign: 'center', fontSize: '14px', fontWeight: 'bold' }}>
                      <span style={{ 
                        color: result.isPass ? '#10b981' : '#ef4444',
                        backgroundColor: result.isPass ? '#d1fae5' : '#fee2e2',
                        padding: '4px 12px',
                        borderRadius: '4px'
                      }}>
                        {result.isPass ? 'PASS' : 'REFER'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
