import React, { useState, useEffect, useRef } from 'react';
import TympanogramGif from './TympanogramGif';

// 典型的なティンパノグラム症例データ
const TYMPANOGRAM_CASES = {
  'A型（正常）': {
    name: 'A型（正常）',
    description: '正常な鼓膜の可動性を示す。ピーク圧は0 daPa付近、コンプライアンスは正常範囲（0.3-1.5 mL）。',
    type: 'A',
    left: { peakPressure: 0, peakCompliance: 1.2, sigma: 60 },
    right: { peakPressure: 0, peakCompliance: 1.3, sigma: 60 },
    clinicalInfo: {
      age: '成人',
      findings: '鼓膜所見正常',
      diagnosis: '正常'
    }
  },
  'B型（平坦型）': {
    name: 'B型（平坦型）',
    description: 'コンプライアンスが低く、ピークが認められない。中耳腔に液体貯留や鼓膜の可動性低下を示す。',
    type: 'B',
    left: { peakPressure: -200, peakCompliance: 0.2, sigma: 80 },
    right: { peakPressure: -200, peakCompliance: 0.1, sigma: 80 },
    clinicalInfo: {
      age: '小児',
      findings: '鼓膜所見：色が悪い・陥没あり',
      diagnosis: '滲出性中耳炎（OME）'
    }
  },
  'C型（陰圧型）': {
    name: 'C型（陰圧型）',
    description: 'ピーク圧が陰圧側（-100 daPa以下）にシフト。耳管機能不全を示す。',
    type: 'C',
    left: { peakPressure: -150, peakCompliance: 1.0, sigma: 60 },
    right: { peakPressure: -120, peakCompliance: 1.1, sigma: 60 },
    clinicalInfo: {
      age: '成人',
      findings: '鼓膜所見：軽度陥没',
      diagnosis: '耳管機能不全'
    }
  },
  'As型（低コンプライアンス型）': {
    name: 'As型（低コンプライアンス型）',
    description: 'ピーク圧は正常（0 daPa付近）だが、コンプライアンスが低い（<0.3 mL）。耳小骨連鎖の固定を示す。',
    type: 'As',
    left: { peakPressure: 0, peakCompliance: 0.2, sigma: 60 },
    right: { peakPressure: 0, peakCompliance: 0.25, sigma: 60 },
    clinicalInfo: {
      age: '成人',
      findings: '鼓膜所見正常',
      diagnosis: '耳硬化症（Otosclerosis）'
    }
  },
  'Ad型（高コンプライアンス型）': {
    name: 'Ad型（高コンプライアンス型）',
    description: 'ピーク圧は正常（0 daPa付近）だが、コンプライアンスが高い（>1.5 mL）。耳小骨連鎖の離断を示す。',
    type: 'Ad',
    left: { peakPressure: 0, peakCompliance: 2.5, sigma: 60 },
    right: { peakPressure: 0, peakCompliance: 2.8, sigma: 60 },
    clinicalInfo: {
      age: '成人',
      findings: '鼓膜所見正常',
      diagnosis: '耳小骨連鎖離断'
    }
  },
  'A型（陽圧型）': {
    name: 'A型（陽圧型）',
    description: 'ピーク圧が陽圧側（+50 daPa以上）にシフト。急性中耳炎の初期や中耳腔の圧上昇を示す。',
    type: 'A',
    left: { peakPressure: 100, peakCompliance: 0.6, sigma: 60 },
    right: { peakPressure: 80, peakCompliance: 0.7, sigma: 60 },
    clinicalInfo: {
      age: '小児・成人',
      findings: '鼓膜所見：炎症（+）',
      diagnosis: '急性中耳炎（AOM）'
    }
  },
  '混合型（左右異なる）': {
    name: '混合型（左右異なる）',
    description: '左右で異なるタイプを示す。片側性疾患の診断に有用。',
    type: 'MIX',
    left: { peakPressure: 0, peakCompliance: 1.2, sigma: 60 },  // 左A型
    right: { peakPressure: 100, peakCompliance: 0.6, sigma: 60 },  // 右A型（陽圧）
    clinicalInfo: {
      age: '成人',
      findings: '左：鼓膜所見正常、右：鼓膜所見炎症（+）',
      diagnosis: '右側急性中耳炎'
    }
  }
};

export default function TympanogramViewer() {
  const [selectedCase, setSelectedCase] = useState('A型（正常）');
  const [showLeft, setShowLeft] = useState(true);
  const [showRight, setShowRight] = useState(true);
  const [tympanogramData, setTympanogramData] = useState(null);
  
  // カスタム設定用のstate
  const [customLeft, setCustomLeft] = useState({ peakPressure: 0, peakCompliance: 1.2, sigma: 60 });
  const [customRight, setCustomRight] = useState({ peakPressure: 0, peakCompliance: 1.3, sigma: 60 });
  const [customType, setCustomType] = useState('A');

  useEffect(() => {
    if (selectedCase === 'カスタム設定') {
      // カスタム設定の場合
      setTympanogramData({
        type: customType,
        left: showLeft ? customLeft : null,
        right: showRight ? customRight : null
      });
    } else {
      // プリセット症例の場合
      const caseData = TYMPANOGRAM_CASES[selectedCase];
      if (caseData) {
        setTympanogramData({
          type: caseData.type,
          left: showLeft ? caseData.left : null,
          right: showRight ? caseData.right : null
        });
      }
    }
  }, [selectedCase, showLeft, showRight, customLeft, customRight, customType]);

  const currentCase = TYMPANOGRAM_CASES[selectedCase];

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">インピーダンスオージオ（ティンパノグラム）症例ビューア</h1>
            <p className="text-gray-600 mb-6">典型的なティンパノグラム症例を選択して確認できます</p>
          </div>
          <button
            onClick={() => {
              window.location.href = '/';
            }}
            className="px-4 py-2 text-sm bg-gray-600 text-white rounded-lg hover:bg-gray-700"
          >
            メインアプリに戻る
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 左側：症例選択パネル */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-xl shadow-lg p-6">
              <h2 className="text-xl font-semibold mb-4">症例選択</h2>
              
              {/* 症例リスト */}
              <div className="space-y-2 mb-6">
                {Object.keys(TYMPANOGRAM_CASES).map((caseKey) => (
                  <button
                    key={caseKey}
                    onClick={() => setSelectedCase(caseKey)}
                    className={`w-full text-left px-4 py-3 rounded-lg border-2 transition-all ${
                      selectedCase === caseKey
                        ? 'border-blue-500 bg-blue-50 text-blue-900'
                        : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <div className="font-semibold">{caseKey}</div>
                  </button>
                ))}
                {/* カスタム設定ボタン */}
                <button
                  onClick={() => setSelectedCase('カスタム設定')}
                  className={`w-full text-left px-4 py-3 rounded-lg border-2 transition-all ${
                    selectedCase === 'カスタム設定'
                      ? 'border-green-500 bg-green-50 text-green-900'
                      : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <div className="font-semibold">🔧 カスタム設定</div>
                  <div className="text-xs text-gray-500 mt-1">自分で値を設定</div>
                </button>
              </div>

              {/* カスタム設定パネル */}
              {selectedCase === 'カスタム設定' && (
                <div className="mb-6 p-4 bg-green-50 rounded-lg border-2 border-green-200">
                  <h3 className="text-sm font-semibold text-green-800 mb-3">カスタム設定</h3>
                  
                  {/* タイプ選択 */}
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">タイプ</label>
                    <select
                      value={customType}
                      onChange={(e) => setCustomType(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                    >
                      <option value="A">A型</option>
                      <option value="B">B型（平坦型）</option>
                      <option value="C">C型（陰圧型）</option>
                      <option value="As">As型（低コンプライアンス型）</option>
                      <option value="Ad">Ad型（高コンプライアンス型）</option>
                      <option value="MIX">混合型</option>
                    </select>
                  </div>

                  {/* 左耳の設定 */}
                  {showLeft && (
                    <div className="mb-4 p-3 bg-blue-50 rounded border border-blue-200">
                      <h4 className="text-sm font-semibold text-blue-800 mb-2">左耳（青）</h4>
                      <div className="space-y-2">
                        <div>
                          <label className="block text-xs text-gray-600 mb-1">ピーク圧 (daPa)</label>
                          <input
                            type="number"
                            value={customLeft.peakPressure}
                            onChange={(e) => setCustomLeft({ ...customLeft, peakPressure: parseFloat(e.target.value) || 0 })}
                            className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                            step="10"
                            min="-300"
                            max="300"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-600 mb-1">コンプライアンス (mL)</label>
                          <input
                            type="number"
                            value={customLeft.peakCompliance}
                            onChange={(e) => setCustomLeft({ ...customLeft, peakCompliance: parseFloat(e.target.value) || 0 })}
                            className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                            step="0.1"
                            min="0"
                            max="5"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-600 mb-1">シグマ (幅)</label>
                          <input
                            type="number"
                            value={customLeft.sigma}
                            onChange={(e) => setCustomLeft({ ...customLeft, sigma: parseFloat(e.target.value) || 60 })}
                            className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                            step="5"
                            min="20"
                            max="100"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 右耳の設定 */}
                  {showRight && (
                    <div className="mb-4 p-3 bg-red-50 rounded border border-red-200">
                      <h4 className="text-sm font-semibold text-red-800 mb-2">右耳（赤）</h4>
                      <div className="space-y-2">
                        <div>
                          <label className="block text-xs text-gray-600 mb-1">ピーク圧 (daPa)</label>
                          <input
                            type="number"
                            value={customRight.peakPressure}
                            onChange={(e) => setCustomRight({ ...customRight, peakPressure: parseFloat(e.target.value) || 0 })}
                            className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-red-500"
                            step="10"
                            min="-300"
                            max="300"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-600 mb-1">コンプライアンス (mL)</label>
                          <input
                            type="number"
                            value={customRight.peakCompliance}
                            onChange={(e) => setCustomRight({ ...customRight, peakCompliance: parseFloat(e.target.value) || 0 })}
                            className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-red-500"
                            step="0.1"
                            min="0"
                            max="5"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-600 mb-1">シグマ (幅)</label>
                          <input
                            type="number"
                            value={customRight.sigma}
                            onChange={(e) => setCustomRight({ ...customRight, sigma: parseFloat(e.target.value) || 60 })}
                            className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-red-500"
                            step="5"
                            min="20"
                            max="100"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* リセットボタン */}
                  <button
                    onClick={() => {
                      setCustomLeft({ peakPressure: 0, peakCompliance: 1.2, sigma: 60 });
                      setCustomRight({ peakPressure: 0, peakCompliance: 1.3, sigma: 60 });
                      setCustomType('A');
                    }}
                    className="w-full px-3 py-2 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                  >
                    リセット
                  </button>
                </div>
              )}

              {/* 耳の選択 */}
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">表示する耳</h3>
                <div className="space-y-2">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showLeft}
                      onChange={(e) => setShowLeft(e.target.checked)}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded"
                    />
                    <span className="text-sm text-gray-700">左耳（青）</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showRight}
                      onChange={(e) => setShowRight(e.target.checked)}
                      className="w-4 h-4 text-red-600 border-gray-300 rounded"
                    />
                    <span className="text-sm text-gray-700">右耳（赤）</span>
                  </label>
                </div>
              </div>

              {/* 症例情報 */}
              {selectedCase === 'カスタム設定' ? (
                <div className="border-t pt-4">
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">カスタム設定情報</h3>
                  <div className="space-y-2 text-sm text-gray-600">
                    <div>
                      <span className="font-medium">タイプ：</span> 
                      <span className="ml-1 font-semibold text-green-600">{customType}型</span>
                    </div>
                    <div>
                      <span className="font-medium">説明：</span>
                      <p className="mt-1">自分で設定した値でティンパノグラムを表示しています。ピーク圧とコンプライアンスを調整して、様々なパターンを確認できます。</p>
                    </div>
                  </div>
                </div>
              ) : currentCase && (
                <div className="border-t pt-4">
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">症例情報</h3>
                  <div className="space-y-2 text-sm text-gray-600">
                    <div>
                      <span className="font-medium">説明：</span>
                      <p className="mt-1">{currentCase.description}</p>
                    </div>
                    <div>
                      <span className="font-medium">年齢：</span> {currentCase.clinicalInfo.age}
                    </div>
                    <div>
                      <span className="font-medium">所見：</span> {currentCase.clinicalInfo.findings}
                    </div>
                    <div>
                      <span className="font-medium">診断：</span> 
                      <span className="ml-1 font-semibold text-blue-600">{currentCase.clinicalInfo.diagnosis}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 右側：ティンパノグラム表示 */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-xl shadow-lg p-6">
              <div className="mb-4">
                <h2 className="text-xl font-semibold mb-2">
                  {selectedCase === 'カスタム設定' ? 'カスタム設定' : currentCase?.name}
                </h2>
                <div className="flex items-center space-x-4 text-sm text-gray-600">
                  {showLeft && (
                    <div className="flex items-center space-x-2">
                      <div className="w-4 h-4 bg-blue-500 rounded"></div>
                      <span>左耳</span>
                      <span className="font-mono">
                        P: {selectedCase === 'カスタム設定' ? customLeft.peakPressure : currentCase?.left?.peakPressure} daPa, 
                        C: {selectedCase === 'カスタム設定' ? customLeft.peakCompliance : currentCase?.left?.peakCompliance} mL
                      </span>
                    </div>
                  )}
                  {showRight && (
                    <div className="flex items-center space-x-2">
                      <div className="w-4 h-4 bg-red-500 rounded"></div>
                      <span>右耳</span>
                      <span className="font-mono">
                        P: {selectedCase === 'カスタム設定' ? customRight.peakPressure : currentCase?.right?.peakPressure} daPa, 
                        C: {selectedCase === 'カスタム設定' ? customRight.peakCompliance : currentCase?.right?.peakCompliance} mL
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* ティンパノグラムコンポーネント */}
              {tympanogramData && (
                <TympanogramGif
                  width={800}
                  height={600}
                  xMin={-200}
                  xMax={200}
                  yMin={0}
                  yMax={selectedCase === 'カスタム設定' ? (customType === 'Ad' || Math.max(customLeft?.peakCompliance || 0, customRight?.peakCompliance || 0) > 2.0 ? 3.5 : 2.5) : (currentCase?.type === 'Ad' ? 3.5 : 2.5)}
                  tympanogramData={tympanogramData}
                  durationMs={5000}
                  fps={20}
                />
              )}

              {/* タイプ別の説明 */}
              {(selectedCase === 'カスタム設定' || currentCase) && (
                <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                  <h3 className="font-semibold mb-2">タイプ別の特徴</h3>
                  <div className="text-sm text-gray-700 space-y-1">
                    {(selectedCase === 'カスタム設定' ? customType : currentCase?.type) === 'A' && (
                      <>
                        <p>• <strong>A型</strong>：正常な鼓膜の可動性</p>
                        <p>• ピーク圧：0 daPa付近、コンプライアンス：0.3-1.5 mL</p>
                      </>
                    )}
                    {(selectedCase === 'カスタム設定' ? customType : currentCase?.type) === 'B' && (
                      <>
                        <p>• <strong>B型</strong>：平坦型、コンプライアンスが低い</p>
                        <p>• 中耳腔に液体貯留や鼓膜の可動性低下を示す</p>
                        <p>• 滲出性中耳炎（OME）でよく見られる</p>
                      </>
                    )}
                    {(selectedCase === 'カスタム設定' ? customType : currentCase?.type) === 'C' && (
                      <>
                        <p>• <strong>C型</strong>：陰圧型</p>
                        <p>• ピーク圧が-100 daPa以下にシフト</p>
                        <p>• 耳管機能不全を示す</p>
                      </>
                    )}
                    {(selectedCase === 'カスタム設定' ? customType : currentCase?.type) === 'As' && (
                      <>
                        <p>• <strong>As型</strong>：低コンプライアンス型</p>
                        <p>• ピーク圧は正常だが、コンプライアンスが低い（&lt;0.3 mL）</p>
                        <p>• 耳小骨連鎖の固定（耳硬化症など）を示す</p>
                      </>
                    )}
                    {(selectedCase === 'カスタム設定' ? customType : currentCase?.type) === 'Ad' && (
                      <>
                        <p>• <strong>Ad型</strong>：高コンプライアンス型</p>
                        <p>• ピーク圧は正常だが、コンプライアンスが高い（&gt;1.5 mL）</p>
                        <p>• 耳小骨連鎖の離断を示す</p>
                      </>
                    )}
                    {(selectedCase === 'カスタム設定' ? customType : currentCase?.type) === 'MIX' && (
                      <>
                        <p>• <strong>混合型</strong>：左右で異なるタイプ</p>
                        <p>• 片側性疾患の診断に有用</p>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

