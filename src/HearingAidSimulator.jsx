import React, { useState, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

// 周波数配列（標準的なオージオグラム周波数）
const FREQUENCIES = [125, 250, 500, 1000, 2000, 4000, 8000];

// チューブ長と口径による周波数特性の減衰を計算
const calculateTubeAttenuation = (frequency, tubeLength, tubeDiameter) => {
  // チューブ長が長いほど、口径が細いほど高周波で減衰が大きい
  // 基準：50mm長、1.9mm口径での減衰特性をモデル化
  
  // 基準減衰率（dB/m）を周波数と口径から計算
  // 細いチューブほど、高周波ほど減衰が大きい
  const baseAttenuationPerMeter = Math.pow(frequency / 1000, 1.8) * Math.pow(1.9 / tubeDiameter, 2.2);
  
  // 長さによる減衰（mmをmに変換）
  const lengthInMeters = tubeLength / 1000;
  const attenuation = -baseAttenuationPerMeter * lengthInMeters * 0.8;
  
  // 低周波（1kHz以下）では減衰が少ない
  if (frequency < 1000) {
    return attenuation * (frequency / 1000) * 0.3;
  }
  
  return attenuation;
};

// 2CCカプラの周波数特性を計算（ISO 60318-5規格に基づく）
const calculate2CCCouplerResponse = (frequency) => {
  // 2CCカプラは2ccの容積を持つ密閉チャンバー
  // 外耳道の共鳴よりも平坦な特性を持つが、完全に平坦ではない
  // 一般的な2CCカプラの周波数特性（実測値に基づく簡略化モデル）
  
  // 低周波（125-500Hz）：やや減衰
  if (frequency <= 500) {
    return -1.5 * (1 - frequency / 500); // 125Hzで-1.5dB、500Hzで0dB
  }
  
  // 中周波（500-2000Hz）：ほぼ平坦
  if (frequency <= 2000) {
    return 0;
  }
  
  // 高周波（2000-4000Hz）：やや増強（軽微な共鳴）
  if (frequency <= 4000) {
    const peakFreq = 2800; // 約2.8kHz付近で軽微なピーク
    const peakGain = 2.0; // 最大2dB程度の増強
    const bandwidth = 1000;
    const detuning = Math.abs(frequency - peakFreq);
    return peakGain * (bandwidth / 2) / (Math.pow(detuning, 2) + Math.pow(bandwidth / 2, 2));
  }
  
  // 超高周波（4000Hz以上）：やや減衰
  if (frequency <= 8000) {
    return -1.0 * ((frequency - 4000) / 4000); // 4000Hzで0dB、8000Hzで-1dB
  }
  
  return -1.5; // 8000Hz以上で-1.5dB
};

// 補聴器形状の定義と特性
const hearingAidTypes = {
  bte: {
    name: '耳掛け型（BTE）',
    description: 'Behind-The-Ear：高出力対応、幅広い聴力レベルに対応',
    maxOutput: 120, // 最大出力レベル（dB SPL）
    hasTube: true, // チューブを使用するか
    frequencyResponse: {
      // 周波数ごとの特性補正（dB）- 相対的な特性（チューブと外耳道の影響は別途計算）
      125: 0,
      250: 0,
      500: 0,
      1000: 0,
      2000: 0,
      4000: 0,
      8000: 0
    }
  },
  ite: {
    name: '耳穴型（ITE）',
    description: 'In-The-Ear：オーダーメイド、目立ちにくい',
    maxOutput: 120,
    frequencyResponse: {
      125: -1,
      250: 0,
      500: 0,
      1000: 1,
      2000: 2,
      4000: 1,
      8000: 0
    }
  },
  ric: {
    name: 'RIC型',
    description: 'Receiver-In-Canal：自然な音質、小型で目立ちにくい',
    maxOutput: 120,
    frequencyResponse: {
      125: 0,
      250: 0,
      500: 0,
      1000: 1,
      2000: 2,
      4000: 2,
      8000: 1
    }
  },
  itc: {
    name: '耳穴型（ITC）',
    description: 'In-The-Canal：小型、目立ちにくい',
    maxOutput: 120,
    frequencyResponse: {
      125: -2,
      250: -1,
      500: 0,
      1000: 1,
      2000: 2,
      4000: 1,
      8000: -1
    }
  },
  cic: {
    name: '完全耳穴型（CIC）',
    description: 'Completely-In-Canal：最も目立ちにくい、軽度〜中程度難聴向け',
    maxOutput: 120,
    frequencyResponse: {
      125: -3,
      250: -2,
      500: -1,
      1000: 0,
      2000: 1,
      4000: 1,
      8000: -2
    }
  }
};

// 補聴器調整式の計算関数
const calculateGain = {
  // ハーフゲイン：聴力閾値の50%をゲインとして適用
  halfGain: (threshold) => threshold * 0.5,
  
  // NAL-R：National Acoustic Laboratories - Revised
  nalR: (threshold) => {
    // NAL-R式：G = 0.31 * (HTL - 17) for HTL > 17
    return threshold > 17 ? 0.31 * (threshold - 17) : 0;
  },
  
  // NAL-NL1：Non-Linear version 1
  nalNL1: (threshold) => {
    // NAL-NL1式：より複雑な計算（簡略版）
    if (threshold <= 0) return 0;
    if (threshold <= 20) return threshold * 0.3;
    if (threshold <= 60) return 6 + (threshold - 20) * 0.5;
    return 26 + (threshold - 60) * 0.3;
  },
  
  // NAL-NL2：Non-Linear version 2（最新版）
  nalNL2: (threshold) => {
    // NAL-NL2式：より精密な計算（簡略版）
    if (threshold <= 0) return 0;
    if (threshold <= 20) return threshold * 0.35;
    if (threshold <= 60) return 7 + (threshold - 20) * 0.55;
    return 29 + (threshold - 60) * 0.35;
  }
};

// 圧縮処理（入力音圧と圧縮比に基づく）
const applyCompression = (inputSPL, gain, compressionRatio, kneepoint, maxOutput) => {
  // kneepoint（圧縮開始点）を超えると圧縮がかかる
  const effectiveInput = inputSPL + gain;
  
  let output;
  if (effectiveInput <= kneepoint) {
    // 線形増幅（圧縮なし）
    output = inputSPL + gain;
  } else {
    // 圧縮領域：超過分を圧縮比で割る
    const excess = effectiveInput - kneepoint;
    const compressedExcess = excess / compressionRatio;
    output = kneepoint + compressedExcess;
  }
  
  // 最大出力レベルで制限
  return Math.min(output, maxOutput);
};

export default function HearingAidSimulator() {
  // オージオグラムデータ（AC値）の状態管理
  const [audiogramData, setAudiogramData] = useState(
    FREQUENCIES.reduce((acc, freq) => {
      acc[freq] = 0;
      return acc;
    }, {})
  );
  
  // 補聴器形状の選択
  const [hearingAidType, setHearingAidType] = useState('bte');
  
  // BTE用：チューブ長の設定（mm）
  const [tubeLength, setTubeLength] = useState(50);
  
  // BTE用：チューブ口径の設定（mm）
  const [tubeDiameter, setTubeDiameter] = useState(1.9);
  
  // 2CCカプラを使用するか（BTE/RIC型の場合）
  const [use2CCCoupler, setUse2CCCoupler] = useState(true);
  
  // 調整式の選択
  const [prescription, setPrescription] = useState('halfGain');
  
  // 圧縮比の設定（周波数ごと）
  const [compressionRatios, setCompressionRatios] = useState(
    FREQUENCIES.reduce((acc, freq) => {
      acc[freq] = 2.0;
      return acc;
    }, {})
  );
  
  // 入力音圧の設定（dBSPL）
  const [inputSPL, setInputSPL] = useState(65);
  
  // 圧縮開始点（kneepoint）の設定（周波数ごと）
  const [kneepoints, setKneepoints] = useState(
    FREQUENCIES.reduce((acc, freq) => {
      acc[freq] = 50;
      return acc;
    }, {})
  );
  
  // 全周波数で同じ設定を使用するかどうか
  const [useGlobalSettings, setUseGlobalSettings] = useState(false);
  
  // グローバル設定（全周波数で同じ値を使用する場合）
  const [globalCompressionRatio, setGlobalCompressionRatio] = useState(2.0);
  const [globalKneepoint, setGlobalKneepoint] = useState(50);

  // 複数の入力レベル（50-90dB）での出力を計算
  const inputLevels = [50, 60, 70, 80, 90]; // dB SPL
  
  // グラフに表示する入力レベルを選択（デフォルトで60dBと70dBを選択）
  const [selectedInputLevels, setSelectedInputLevels] = useState([60, 70]);
  
  // 各入力レベルでの出力を計算する関数
  const calculateOutputForInput = (freq, inputLevel) => {
    const typeConfig = hearingAidTypes[hearingAidType];
    const maxOutput = typeConfig.maxOutput;
    const isBTE = typeConfig.hasTube;
    
    const threshold = audiogramData[freq] || 0;
    let gain = calculateGain[prescription](threshold);
    
    // 形状による周波数特性補正をゲインに適用
    const freqResponse = typeConfig.frequencyResponse[freq] || 0;
    gain += freqResponse;
    
    // 圧縮を適用して補聴器出力音圧レベルを計算
    const compressionRatio = useGlobalSettings ? globalCompressionRatio : (compressionRatios[freq] || 2.0);
    const kneepoint = useGlobalSettings ? globalKneepoint : (kneepoints[freq] || 50);
    let outputSPL = applyCompression(inputLevel, gain, compressionRatio, kneepoint, maxOutput);
    
    // BTEの場合：チューブを通す（減衰を適用）
    if (isBTE) {
      const tubeAttenuation = calculateTubeAttenuation(freq, tubeLength, tubeDiameter);
      outputSPL += tubeAttenuation;
    }
    
    // 2CCカプラの特性を適用
    if (use2CCCoupler && (isBTE || hearingAidType === 'ric')) {
      const couplerResponse = calculate2CCCouplerResponse(freq);
      outputSPL += couplerResponse;
    }
    
    // 最終出力は最大出力レベルを超えないように制限
    return Math.min(outputSPL, maxOutput);
  };

  // グラフデータの計算（複数の入力レベルに対応）
  const chartData = useMemo(() => {
    return FREQUENCIES.map(freq => {
      const data = { frequency: freq };
      
      // 各入力レベルでの出力を計算
      inputLevels.forEach(inputLevel => {
        data[`output_${inputLevel}`] = calculateOutputForInput(freq, inputLevel);
      });
      
      return data;
    });
  }, [audiogramData, prescription, compressionRatios, kneepoints, useGlobalSettings, globalCompressionRatio, globalKneepoint, hearingAidType, tubeLength, tubeDiameter, use2CCCoupler]);

  // AC値の更新ハンドラ
  const handleThresholdChange = (freq, value) => {
    const numValue = parseFloat(value) || 0;
    setAudiogramData(prev => ({
      ...prev,
      [freq]: numValue
    }));
  };

  // 圧縮比の更新ハンドラ
  const handleCompressionRatioChange = (freq, value) => {
    const numValue = parseFloat(value) || 2.0;
    setCompressionRatios(prev => ({
      ...prev,
      [freq]: numValue
    }));
  };

  // 圧縮開始点の更新ハンドラ
  const handleKneepointChange = (freq, value) => {
    const numValue = parseInt(value) || 50;
    setKneepoints(prev => ({
      ...prev,
      [freq]: numValue
    }));
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-6">
          補聴器特性測定シミュレーター
        </h1>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 左側：設定パネル */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold mb-4 text-gray-800">設定</h2>
            
            {/* オージオグラムデータ入力 */}
            <div className="mb-6">
              <h3 className="text-lg font-medium mb-3 text-gray-700">
                オージオグラムデータ（AC値：dB HL）
              </h3>
              <div className="space-y-2">
                {FREQUENCIES.map(freq => (
                  <div key={freq} className="flex items-center gap-4">
                    <label className="w-24 text-sm font-medium text-gray-600">
                      {freq} Hz:
                    </label>
                    <input
                      type="number"
                      value={audiogramData[freq] || ''}
                      onChange={(e) => handleThresholdChange(freq, e.target.value)}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="0"
                      step="5"
                    />
                    <span className="text-sm text-gray-500">dB HL</span>
                  </div>
                ))}
              </div>
            </div>

            {/* 補聴器形状選択 */}
            <div className="mb-6">
              <h3 className="text-lg font-medium mb-3 text-gray-700">
                補聴器形状
              </h3>
              <select
                value={hearingAidType}
                onChange={(e) => setHearingAidType(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {Object.entries(hearingAidTypes).map(([key, config]) => (
                  <option key={key} value={key}>
                    {config.name}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-2">
                {hearingAidTypes[hearingAidType].description}
              </p>
              <p className="text-xs text-gray-600 mt-1 font-medium">
                最大出力レベル: {hearingAidTypes[hearingAidType].maxOutput} dB SPL
              </p>
            </div>

            {/* BTE用：チューブ設定 */}
            {hearingAidTypes[hearingAidType].hasTube && (
              <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
                <h3 className="text-lg font-medium mb-3 text-gray-700">
                  BTEチューブ設定
                </h3>
                
                {/* チューブ長設定 */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    チューブ長: {tubeLength} mm
                  </label>
                  <input
                    type="range"
                    min="30"
                    max="80"
                    step="5"
                    value={tubeLength}
                    onChange={(e) => setTubeLength(parseInt(e.target.value))}
                    className="w-full"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    長いほど高周波で減衰が大きくなります（標準: 50mm）
                  </p>
                </div>

                {/* チューブ口径設定 */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    チューブ口径: {tubeDiameter.toFixed(1)} mm
                  </label>
                  <div className="flex gap-2 mb-2">
                    {[1.0, 1.3, 1.9, 2.3].map(dia => (
                      <button
                        key={dia}
                        onClick={() => setTubeDiameter(dia)}
                        className={`px-3 py-1 text-sm rounded ${
                          tubeDiameter === dia
                            ? 'bg-blue-600 text-white'
                            : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        {dia.toFixed(1)}mm
                      </button>
                    ))}
                  </div>
                  <input
                    type="range"
                    min="1.0"
                    max="2.5"
                    step="0.1"
                    value={tubeDiameter}
                    onChange={(e) => setTubeDiameter(parseFloat(e.target.value))}
                    className="w-full"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    細いほど高周波で減衰が大きくなります（標準: 1.9mm）
                  </p>
                </div>

                {/* 2CCカプラ設定 */}
                <div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={use2CCCoupler}
                      onChange={(e) => setUse2CCCoupler(e.target.checked)}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <span className="text-sm font-medium text-gray-700">
                      2CCカプラを使用（標準測定条件）
                    </span>
                  </label>
                  <p className="text-xs text-gray-500 mt-2 ml-6">
                    2CCカプラ（ISO 60318-5規格）は補聴器の標準測定に使用される2cc容積の密閉チャンバーです。
                    外耳道の共鳴よりも平坦な特性を持ち、約2.8kHz付近で軽微な増強（約2dB）があります。
                    補聴器の出力特性を標準化された条件下で評価するために使用されます。
                  </p>
                </div>
              </div>
            )}

            {/* 調整式選択 */}
            <div className="mb-6">
              <h3 className="text-lg font-medium mb-3 text-gray-700">
                補聴器調整式
              </h3>
              <select
                value={prescription}
                onChange={(e) => setPrescription(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="halfGain">ハーフゲイン（Half Gain）</option>
                <option value="nalR">NAL-R</option>
                <option value="nalNL1">NAL-NL1</option>
                <option value="nalNL2">NAL-NL2</option>
              </select>
            </div>

            {/* 圧縮設定モード選択 */}
            <div className="mb-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={useGlobalSettings}
                  onChange={(e) => setUseGlobalSettings(e.target.checked)}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-gray-700">
                  全周波数で同じ圧縮設定を使用
                </span>
              </label>
            </div>

            {/* 圧縮比設定 */}
            <div className="mb-6">
              <h3 className="text-lg font-medium mb-3 text-gray-700">
                圧縮比 {useGlobalSettings ? '(全周波数共通)' : '(周波数ごと)'}
              </h3>
              {useGlobalSettings ? (
                <div className="flex items-center gap-4">
                  <input
                    type="range"
                    min="1"
                    max="10"
                    step="0.5"
                    value={globalCompressionRatio}
                    onChange={(e) => setGlobalCompressionRatio(parseFloat(e.target.value))}
                    className="flex-1"
                  />
                  <span className="w-20 text-sm font-medium text-gray-700">
                    {globalCompressionRatio.toFixed(1)}:1
                  </span>
                </div>
              ) : (
                <div className="space-y-2">
                  {FREQUENCIES.map(freq => (
                    <div key={freq} className="flex items-center gap-4">
                      <label className="w-24 text-sm font-medium text-gray-600">
                        {freq} Hz:
                      </label>
                      <input
                        type="range"
                        min="1"
                        max="10"
                        step="0.5"
                        value={compressionRatios[freq] || 2.0}
                        onChange={(e) => handleCompressionRatioChange(freq, e.target.value)}
                        className="flex-1"
                      />
                      <span className="w-20 text-sm font-medium text-gray-700">
                        {(compressionRatios[freq] || 2.0).toFixed(1)}:1
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-xs text-gray-500 mt-1">
                1:1 = 線形増幅、値が大きいほど圧縮が強い
              </p>
            </div>

            {/* 入力音圧設定 */}
            <div className="mb-6">
              <h3 className="text-lg font-medium mb-3 text-gray-700">
                入力音圧レベル
              </h3>
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min="40"
                  max="100"
                  step="5"
                  value={inputSPL}
                  onChange={(e) => setInputSPL(parseInt(e.target.value))}
                  className="flex-1"
                />
                <span className="w-20 text-sm font-medium text-gray-700">
                  {inputSPL} dB SPL
                </span>
              </div>
            </div>

            {/* 圧縮開始点設定 */}
            <div className="mb-6">
              <h3 className="text-lg font-medium mb-3 text-gray-700">
                圧縮開始点（Kneepoint） {useGlobalSettings ? '(全周波数共通)' : '(周波数ごと)'}
              </h3>
              {useGlobalSettings ? (
                <div className="flex items-center gap-4">
                  <input
                    type="range"
                    min="30"
                    max="80"
                    step="5"
                    value={globalKneepoint}
                    onChange={(e) => setGlobalKneepoint(parseInt(e.target.value))}
                    className="flex-1"
                  />
                  <span className="w-20 text-sm font-medium text-gray-700">
                    {globalKneepoint} dB SPL
                  </span>
                </div>
              ) : (
                <div className="space-y-2">
                  {FREQUENCIES.map(freq => (
                    <div key={freq} className="flex items-center gap-4">
                      <label className="w-24 text-sm font-medium text-gray-600">
                        {freq} Hz:
                      </label>
                      <input
                        type="range"
                        min="30"
                        max="80"
                        step="5"
                        value={kneepoints[freq] || 50}
                        onChange={(e) => handleKneepointChange(freq, e.target.value)}
                        className="flex-1"
                      />
                      <span className="w-20 text-sm font-medium text-gray-700">
                        {kneepoints[freq] || 50} dB SPL
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-2 space-y-1">
                <p className="text-xs text-gray-500">
                  この入力レベル（dB SPL）を超えると圧縮が開始されます
                </p>
                <p className="text-xs text-gray-600 font-medium">
                  一般的な設定範囲：40-60 dB SPL（標準値：50 dB SPL）
                </p>
                <p className="text-xs text-gray-500">
                  ・軽度難聴：40-50 dB | ・中程度難聴：50-60 dB | ・高度難聴：60-70 dB
                </p>
              </div>
            </div>
          </div>

          {/* 右側：グラフ表示 */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-gray-800">
                入力・出力特性グラフ
              </h2>
              
              {/* 入力レベル選択 */}
              <div className="flex items-center gap-4">
                <span className="text-sm font-medium text-gray-700">表示する入力レベル:</span>
                <div className="flex gap-2">
                  {inputLevels.map((level) => (
                    <label key={level} className="flex items-center gap-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedInputLevels.includes(level)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedInputLevels([...selectedInputLevels, level].sort((a, b) => a - b));
                          } else {
                            setSelectedInputLevels(selectedInputLevels.filter(l => l !== level));
                          }
                        }}
                        className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700">{level}dB</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
            
            <ResponsiveContainer width="100%" height={500}>
              <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="frequency" 
                  type="number"
                  scale="log"
                  domain={[100, 10000]}
                  label={{ value: '周波数 (Hz)', position: 'insideBottom', offset: -5 }}
                  tickFormatter={(value) => `${value}`}
                />
                <YAxis 
                  label={{ value: '出力 (dB SPL)', angle: -90, position: 'insideLeft' }}
                  domain={[0, 120]}
                />
                <Tooltip 
                  formatter={(value, name) => {
                    if (name.startsWith('output_')) {
                      const inputLevel = name.replace('output_', '');
                      return [`${value} dB SPL`, `入力${inputLevel}dB`];
                    }
                    return value;
                  }}
                  labelFormatter={(label) => `周波数: ${label} Hz`}
                />
                <Legend />
                {selectedInputLevels.map((inputLevel, index) => {
                  const colors = ['#8884d8', '#82ca9d', '#ffc658', '#ff7300', '#ff0000'];
                  const levelIndex = inputLevels.indexOf(inputLevel);
                  return (
                    <Line 
                      key={inputLevel}
                      type="monotone" 
                      dataKey={`output_${inputLevel}`}
                      stroke={colors[levelIndex % colors.length]}
                      strokeWidth={2}
                      name={`入力${inputLevel}dB`}
                      dot={{ r: 4 }}
                    />
                  );
                })}
              </LineChart>
            </ResponsiveContainer>

            {/* ゲイン表示テーブル */}
            <div className="mt-6">
              <h3 className="text-lg font-medium mb-3 text-gray-700">
                周波数別ゲイン値
              </h3>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        周波数 (Hz)
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        聴力閾値 (dB HL)
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        ゲイン (dB)
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        入力 (dB SPL)
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        出力 (dB SPL)
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        圧縮比
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        Kneepoint
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        最大出力
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {FREQUENCIES.map((freq) => {
                      const threshold = audiogramData[freq] || 0;
                      const gain = calculateGain[prescription](threshold);
                      const typeConfig = hearingAidTypes[hearingAidType];
                      const freqResponse = typeConfig.frequencyResponse[freq] || 0;
                      const adjustedGain = gain + freqResponse;
                      const compressionRatio = useGlobalSettings ? globalCompressionRatio : (compressionRatios[freq] || 2.0);
                      const kneepoint = useGlobalSettings ? globalKneepoint : (kneepoints[freq] || 50);
                      const output = calculateOutputForInput(freq, inputSPL);
                      const maxOutput = typeConfig.maxOutput;
                      
                      return (
                        <tr key={freq}>
                          <td className="px-4 py-2 text-sm text-gray-900">
                            {freq}
                          </td>
                          <td className="px-4 py-2 text-sm text-gray-600">
                            {threshold.toFixed(1)}
                          </td>
                          <td className="px-4 py-2 text-sm text-gray-600">
                            {adjustedGain.toFixed(1)}
                          </td>
                          <td className="px-4 py-2 text-sm text-gray-600">
                            {inputSPL} dB SPL
                          </td>
                          <td className={`px-4 py-2 text-sm font-medium ${
                            output >= maxOutput ? 'text-red-600' : 'text-gray-900'
                          }`}>
                            {output.toFixed(1)}
                            {output >= maxOutput && ' (最大)'}
                          </td>
                          <td className="px-4 py-2 text-sm text-gray-600">
                            {compressionRatio.toFixed(1)}:1
                          </td>
                          <td className="px-4 py-2 text-sm text-gray-600">
                            {kneepoint} dB SPL
                          </td>
                          <td className="px-4 py-2 text-sm text-gray-600">
                            {maxOutput} dB SPL
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

