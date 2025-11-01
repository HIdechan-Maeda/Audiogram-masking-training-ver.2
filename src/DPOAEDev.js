import React, { useState } from 'react';
import DPOAE from './DPOAE';

// 開発用：各症例のDPOAEを確認する画面
function buildDPOAEConfig(presetTargets, tympanogram) {
  const dpoaeFrequencies = [1, 2, 3, 4, 6, 8];
  const audiogramAC = { right: {}, left: {} };
  presetTargets.forEach(target => {
    if (target.transducer === 'AC') {
      const earKey = target.ear === 'R' ? 'right' : 'left';
      audiogramAC[earKey][target.freq] = target.so ? 110 : target.dB;
    }
  });
  
  const freqMapping = {
    1: 1000, 2: 2000, 3: 4000, 4: 4000, 6: 8000, 8: 8000
  };
  
  const acThresholds = { right: {}, left: {} };
  dpoaeFrequencies.forEach(dpoaeFreq => {
    const audiogramFreq = freqMapping[dpoaeFreq];
    ['right', 'left'].forEach(ear => {
      const acValue = audiogramAC[ear][audiogramFreq];
      if (acValue !== undefined) {
        acThresholds[ear][dpoaeFreq] = acValue;
      }
    });
  });
  
  const getTympanogramType = (ear, tymp) => {
    if (tymp?.type === 'B') return 'B';
    const peak = tymp?.[ear]?.peakPressure || 0;
    if (peak > 50) return 'B';
    if (peak < -150) return 'B';
    return 'A';
  };
  
  return {
    acThresholds,
    tympanogramType: {
      right: getTympanogramType('right', tympanogram),
      left: getTympanogramType('left', tympanogram)
    }
  };
}

function generateDPOAEData(dpoaeConfig, caseId = '') {
  const frequencies = [1, 2, 3, 4, 6, 8];
  const noiseFloorBase = {
    1: 17, 2: 15, 3: 13, 4: 11.5, 6: 10, 8: 10
  };
  
  // 左右で異なるノイズフロア値を生成
  const getNoiseFloor = (freq, ear) => {
    const base = noiseFloorBase[freq];
    // 症例IDと周波数、耳に基づく固定変動パターン（左右で異なる変動を加える）
    // 右耳と左耳で異なるseedを使用して、左右で異なるノイズフロア値を生成
    const earMultiplier = ear === 'right' ? 1 : 3; // 左右で異なるパターンを作るための係数
    const seed = (caseId.charCodeAt(0) || 65) * 100 + freq * 10 + earMultiplier;
    // 左右で異なる変動パターン（右耳はsin系、左耳はcos系に偏らせる）
    const sinVariation = Math.sin(seed * 0.1) * 2.5;
    const cosVariation = Math.cos(seed * 0.15) * 1.5;
    const variation = ear === 'right' 
      ? sinVariation + cosVariation * 0.8  // 右耳のパターン
      : cosVariation + sinVariation * 0.8; // 左耳のパターン（異なるパターン）
    const rangeMin = { 1: 12, 2: 10, 3: 8, 4: 7, 6: 6, 8: 6 }[freq];
    const rangeMax = { 1: 22, 2: 20, 3: 18, 4: 16, 6: 14, 8: 14 }[freq];
    return Math.max(rangeMin, Math.min(rangeMax, base + variation));
  };
  
  const generateEarData = (ear) => {
    const acThresholds = dpoaeConfig.acThresholds[ear];
    const tympanogramType = dpoaeConfig.tympanogramType[ear];
    
    return frequencies.map((freq, index) => {
      const acThreshold = acThresholds[freq];
      const noiseFloor = getNoiseFloor(freq, ear);
      
      let snr;
      if (tympanogramType === 'B' || (acThreshold !== undefined && acThreshold >= 35)) {
        // 異常: SNR < 2dB（固定値: 約1dB）
        const seed = (caseId.charCodeAt(0) || 65) * 1000 + freq * 100 + index * 10 + (ear === 'right' ? 1 : 2);
        snr = 0.5 + (Math.sin(seed * 0.1) * 0.5 + Math.cos(seed * 0.2) * 0.3); // 0.5〜1.5dB程度の固定値
      } else {
        // 正常: SNR 6〜12dB（固定値で右左に差、確実に6以上になるように）
        const seed = (caseId.charCodeAt(0) || 65) * 1000 + freq * 100 + index * 10 + (ear === 'right' ? 1 : 2);
        // 右耳と左耳で若干差が出るように（±1-2dB程度）
        const baseSNR = 8; // 基本SNR 8dB
        const earOffset = ear === 'right' ? Math.sin(seed * 0.05) * 1.5 : Math.cos(seed * 0.05) * 1.5;
        // SNRが確実に6以上になるように（最小値6dB、最大値12dB程度）
        snr = Math.max(6, Math.min(12, baseSNR + earOffset));
      }
      
      return Math.max(0, Math.min(30, noiseFloor + snr));
    });
  };
  
  // ノイズフロアデータも生成（SNR計算用）
  const noiseFloorData = {
    right: frequencies.map((freq) => getNoiseFloor(freq, 'right')),
    left: frequencies.map((freq) => getNoiseFloor(freq, 'left'))
  };
  
  return {
    right: generateEarData('right'),
    left: generateEarData('left'),
    noiseFloor: noiseFloorData
  };
}

// プリセット症例データ
const mk = (ear, transducer, list) =>
  list.map(([freq, dB, so=false]) => ({ ear, transducer, masked:transducer==='BC', freq, dB, ...(so?{so:true}:{}) }));
const preset = (name, parts) => ({ name, targets: parts.flat() });

const PRESET_A = preset('症例A', [
  mk('R','AC', [[125,5],[250,5],[500,5],[1000,5],[2000,5],[4000,0],[8000,0]]),
  mk('L','AC', [[125,10],[250,10],[500,5],[1000,5],[2000,5],[4000,0],[8000,-5]]),
  mk('R','BC', [[250,5],[500,10],[1000,5],[2000,5],[4000,-5]]),
  mk('L','BC', [[250,5],[500,5],[1000,0],[2000,5],[4000,0]])
]);

const PRESET_B = preset('症例B', [
  mk('R','AC', [[125,10],[250,10],[500,30],[1000,50],[2000,70],[4000,90],[8000,100]]),
  mk('R','BC', [[125,10],[250,15],[500,30],[1000,50],[2000,70],[4000,110,true],[8000,100]]),
  mk('L','AC', [[125,15],[250,15],[500,10],[1000,10],[2000,5],[4000,5],[8000,10]]),
  mk('L','BC', [[250,15],[500,10],[1000,10],[2000,5],[4000,5]])
]);

const PRESET_C = preset('症例C', [
  mk('R','AC', [[125,20],[250,20],[500,15],[1000,10],[2000,10],[4000,5],[8000,5]]),
  mk('R','BC', [[250,15],[500,15],[1000,10],[2000,5],[4000,10]]),
  mk('L','AC', [[125,110,true],[250,110,true],[500,110,true],[1000,110,true],[2000,110,true],[4000,110,true],[8000,110,true]]),
  mk('L','BC', [[250,110,true],[500,110,true],[1000,110,true],[2000,110,true],[4000,110,true]])
]);

const PRESET_D = preset('症例D', [
  mk('R','AC', [[125,5],[250,5],[500,5],[1000,10],[2000,25],[4000,45],[8000,65]]),
  mk('R','BC', [[125,5],[250,5],[500,5],[1000,10],[2000,20],[4000,35],[8000,50]]),
  mk('L','AC', [[125,25],[250,30],[500,20],[1000,10],[2000,5],[4000,5],[8000,10]]),
  mk('L','BC', [[125,20],[250,25],[500,20],[1000,10],[2000,5],[4000,5],[8000,10]])
]);

const PRESET_E = preset('症例E', [
  mk('R','AC', [[125,15],[250,20],[500,20],[1000,30],[2000,35],[4000,35],[8000,45]]),
  mk('R','BC', [[125,10],[250,15],[500,20],[1000,25],[2000,30],[4000,35],[8000,40]]),
  mk('L','AC', [[125,40],[250,45],[500,40],[1000,55],[2000,60],[4000,60],[8000,70]]),
  mk('L','BC', [[125,35],[250,40],[500,45],[1000,50],[2000,55],[4000,60],[8000,65]])
]);

const PRESET_F = preset('症例F', [
  mk('R','AC', [[125,15],[250,15],[500,15],[1000,30],[2000,45],[4000,60],[8000,80]]),
  mk('R','BC', [[250,20],[500,20],[1000,25],[2000,45],[4000,60]]),
  mk('L','AC', [[125,10],[250,15],[500,20],[1000,30],[2000,45],[4000,65],[8000,80]]),
  mk('L','BC', [[250,15],[500,20],[1000,30],[2000,45],[4000,110,true]])
]);

const PRESET_G = preset('症例G', [
  mk('R','AC', [[125,35],[250,25],[500,20],[1000,25],[2000,25],[4000,10],[8000,20]]),
  mk('R','BC', [[125,5],[250,5],[500,10],[1000,10],[2000,5],[4000,5],[8000,5]]),
  mk('L','AC', [[125,35],[250,25],[500,25],[1000,20],[2000,20],[4000,25],[8000,35]]),
  mk('L','BC', [[250,10],[500,15],[1000,10],[2000,15],[4000,0]])
]);

const PRESET_H = preset('症例H', [
  mk('R','AC', [[125,10],[250,10],[500,10],[1000,25],[2000,30],[4000,30],[8000,50]]),
  mk('R','BC', [[250,5],[500,5],[1000,30],[2000,30],[4000,25]]),
  mk('L','AC', [[125,35],[250,40],[500,40],[1000,50],[2000,45],[4000,40],[8000,50]]),
  mk('L','BC', [[250,10],[500,15],[1000,20],[2000,25],[4000,20]])
]);

const PRESET_DETAILS = {
  A: {
    age: '12歳',
    gender: '男子',
    chiefComplaint: '学校検診で聞こえの悪さを指摘された',
    history: '本人から話を聞くと周囲がうるさくて、検査音が聞こえなかった様子。念の為受信した',
    findings: '鼓膜所見正常、ティンパノ両耳A型、DPOAEは両耳PASSである',
    tympanogram: { 
      type: 'A', 
      left: { peakPressure: 0, peakCompliance: 1.5, sigma: 60 },
      right: { peakPressure: 0, peakCompliance: 1.3, sigma: 60 }
    }
  },
  B: {
    age: '45歳',
    gender: '男性',
    chiefComplaint: '右耳難聴、耳鳴、めまい感',
    history: '昨日から突然右耳の耳閉塞感と耳鳴、回転性めまい感あり。今日になってめまい感はだいぶ治ったが、聞こえの悪さは変わらないため受診した',
    findings: '鼓膜所見正常、ティンパノ両耳A型、DPOAE左耳PASS、右耳REFER',
    tympanogram: { 
      type: 'A', 
      left: { peakPressure: -10, peakCompliance: 1.5, sigma: 60 },
      right: { peakPressure: 0, peakCompliance: 1.3, sigma: 60 }
    }
  },
  C: {
    age: '7歳',
    gender: '女性',
    chiefComplaint: '左耳の聞こえの悪さ',
    history: '入学時の学校検診で左耳難聴を指摘され、精査のため受診した',
    findings: '鼓膜所見正常、ティンパノ両耳A型、DPOAE 右耳PASS 左耳REFER',
    tympanogram: { 
      type: 'A', 
      left: { peakPressure: 0, peakCompliance: 0.8, sigma: 60 },
      right: { peakPressure: 0, peakCompliance: 0.9, sigma: 60 }
    }
  },
  D: {
    age: '32歳',
    gender: '男性',
    chiefComplaint: '耳閉塞感、耳鳴り、めまい',
    history: '20歳の時、右耳突発性難聴。1週間前から回転性めまいあり。良くなったり悪くなったり。左耳ゴーという耳鳴りが気になる',
    findings: '鼓膜所見正常、ティンパノ両耳A型、DPOAE（高周波数域） 右耳REFER 左耳PASS',
    tympanogram: { 
      type: 'A', 
      left: { peakPressure: -15, peakCompliance: 1.3, sigma: 60 },
      right: { peakPressure: 10, peakCompliance: 1.5, sigma: 60 }
    }
  },
  E: {
    age: '55歳',
    gender: '女性',
    chiefComplaint: '聞こえの悪さ（特に左耳）',
    history: '徐々に聞こえ悪くなった。最近、電話を左で取ると聞こえづらいのがわかった。今は右耳で電話をとっている。いつから聞こえ悪いのかよくわからない',
    findings: '鼓膜所見正常、ティンパノ両耳A型、DPOAE（高周波数域）両耳REFER',
    tympanogram: { 
      type: 'A', 
      left: { peakPressure: -10, peakCompliance: 1.2, sigma: 60 },
      right: { peakPressure: 15, peakCompliance: 1.4, sigma: 60 }
    }
  },
  F: {
    age: '70歳',
    gender: '女性',
    chiefComplaint: 'TVの音が聞こえにくい',
    history: 'ご主人から聞こえの悪さを指摘される。TVの音が大きいと言われる。そう言われたらそうかなと。ご主人が補聴器を勧めてきたので、仕方なく受診した',
    findings: '鼓膜所見正常、ティンパノ両耳A型、DPOAE（高周波数域）両耳REFER',
    tympanogram: { 
      type: 'A', 
      left: { peakPressure: 5, peakCompliance: 1.1, sigma: 60 },
      right: { peakPressure: -20, peakCompliance: 1.3, sigma: 60 }
    }
  },
  G: {
    age: '12歳',
    gender: '女性',
    chiefComplaint: '鼻水が出る。聞こえの悪さ',
    history: '小さい頃から滲出性中耳炎を繰り返す',
    findings: '鼓膜所見：色が悪い・陥没あり、ティンパノB型',
    tympanogram: { 
      type: 'B', 
      left: { peakPressure: -200, peakCompliance: 0.2, sigma: 80 },
      right: { peakPressure: -200, peakCompliance: 0.1, sigma: 80 }
    }
  },
  H: {
    age: '68歳',
    gender: '男性',
    chiefComplaint: '耳痛、聞こえの悪さ、耳閉塞感',
    history: '2日前より耳痛と耳閉塞感あり',
    findings: '鼓膜所見炎症（＋）、ティンパノ右A型・左A型',
    tympanogram: { 
      type: 'MIX', 
      left: { peakPressure: 0, peakCompliance: 1.2, sigma: 60 },
      right: { peakPressure: 100, peakCompliance: 0.6, sigma: 60 }
    }
  }
};

const PRESET_MAP = {
  A: PRESET_A, B: PRESET_B, C: PRESET_C, D: PRESET_D,
  E: PRESET_E, F: PRESET_F, G: PRESET_G, H: PRESET_H
};

export default function DPOAEDev() {
  const [selectedCase, setSelectedCase] = useState('A');
  
  try {
    // 症例データを取得
    const preset = PRESET_MAP[selectedCase];
    const tympanogram = PRESET_DETAILS[selectedCase]?.tympanogram;
    
    // DPOAE設定を構築
    const dpoaeConfig = preset && tympanogram ? buildDPOAEConfig(preset.targets, tympanogram) : null;
    
    // DPOAEデータを生成
    const dpoaeData = dpoaeConfig ? generateDPOAEData(dpoaeConfig, selectedCase) : null;
    
    return (
      <div style={{ padding: '20px', maxWidth: '1400px', margin: '0 auto' }}>
        <div style={{ marginBottom: '24px' }}>
          <h1 style={{ fontSize: '28px', marginBottom: '16px', color: '#1f2937' }}>
            DPOAE 開発画面 - 症例別確認
          </h1>
          
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '16px' }}>
            <label style={{ fontSize: '16px', fontWeight: '500' }}>症例選択:</label>
            <select
              value={selectedCase}
              onChange={(e) => setSelectedCase(e.target.value)}
              style={{
                padding: '8px 16px',
                fontSize: '16px',
                borderRadius: '8px',
                border: '2px solid #3b82f6',
                backgroundColor: 'white',
                cursor: 'pointer'
              }}
            >
              <option value="A">症例A</option>
              <option value="B">症例B</option>
              <option value="C">症例C</option>
              <option value="D">症例D</option>
              <option value="E">症例E</option>
              <option value="F">症例F</option>
              <option value="G">症例G</option>
              <option value="H">症例H</option>
            </select>
          </div>
          
          {PRESET_DETAILS[selectedCase] && (
            <div style={{ 
              backgroundColor: '#f9fafb', 
              padding: '16px', 
              borderRadius: '12px',
              border: '1px solid #e5e7eb',
              marginBottom: '16px'
            }}>
              <h2 style={{ fontSize: '18px', marginBottom: '12px', color: '#111827' }}>
                症例{selectedCase}情報
              </h2>
              <div style={{ fontSize: '14px', color: '#4b5563', lineHeight: '1.6' }}>
                <div><strong>年齢・性別:</strong> {PRESET_DETAILS[selectedCase].age} {PRESET_DETAILS[selectedCase].gender}</div>
                <div><strong>主訴:</strong> {PRESET_DETAILS[selectedCase].chiefComplaint}</div>
                <div><strong>所見:</strong> {PRESET_DETAILS[selectedCase].findings}</div>
              </div>
            </div>
          )}
        </div>
        
        {dpoaeData ? (
          <DPOAE
            width={1000}
            height={600}
            dpoaeData={dpoaeData}
            durationMs={10000}
            fps={20}
          />
        ) : (
          <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>
            データを読み込み中...
          </div>
        )}
      </div>
    );
  } catch (error) {
    console.error('DPOAEDev Error:', error);
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <h2 style={{ color: '#ef4444' }}>エラーが発生しました</h2>
        <p style={{ color: '#6b7280', marginTop: '16px' }}>{error.message}</p>
        <pre style={{ marginTop: '16px', textAlign: 'left', backgroundColor: '#f9fafb', padding: '16px', borderRadius: '8px', overflow: 'auto' }}>
          {error.stack}
        </pre>
      </div>
    );
  }
}

