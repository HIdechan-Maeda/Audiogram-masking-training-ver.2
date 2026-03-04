import React, { useState } from 'react';
import { HEARING_DISORDERS } from './data/hearingDisorders';

export default function EpidemiologyViewer() {
  const [selectedDisorder, setSelectedDisorder] = useState(HEARING_DISORDERS[0] || null);
  const [searchTerm, setSearchTerm] = useState('');

  // 検索フィルタリング
  const filteredDisorders = HEARING_DISORDERS.filter(disorder =>
    disorder.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    disorder.epidemiology.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* ヘッダー */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              難聴疾患の疫学データ
            </h1>
            <p className="text-gray-600 mb-6">
              各疾患の疫学情報、特徴、検査所見を参照できます
            </p>
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
          {/* 左側：疾患選択パネル */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-xl shadow-lg p-6">
              <h2 className="text-xl font-semibold mb-4">疾患選択</h2>
              
              {/* 検索バー */}
              <div className="mb-4">
                <input
                  type="text"
                  placeholder="疾患名で検索..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              {/* 疾患リスト */}
              <div className="space-y-2 mb-6">
                {HEARING_DISORDERS.length === 0 ? (
                  <p className="text-sm text-red-500 text-center py-4">
                    データが読み込まれていません
                  </p>
                ) : filteredDisorders.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-4">
                    検索結果が見つかりませんでした
                  </p>
                ) : (
                  filteredDisorders.map((disorder) => (
                    <button
                      key={disorder.name}
                      onClick={() => setSelectedDisorder(disorder)}
                      className={`w-full text-left px-4 py-3 rounded-lg border-2 transition-all ${
                        selectedDisorder?.name === disorder.name
                          ? 'border-blue-500 bg-blue-50 text-blue-900'
                          : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      <div className="font-semibold">{disorder.name}</div>
                      <div className="text-xs text-gray-500 mt-1">
                        {disorder.pattern}
                      </div>
                    </button>
                  ))
                )}
              </div>

              {/* 疾患情報 */}
              {selectedDisorder && (
                <div className="border-t pt-4">
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">疾患情報</h3>
                  <div className="space-y-2 text-sm text-gray-600">
                    <div>
                      <span className="font-medium">パターン：</span> {selectedDisorder.pattern}
                    </div>
                    <div>
                      <span className="font-medium">好発年齢：</span> 
                      {selectedDisorder.ageRange[0]}〜{selectedDisorder.ageRange[1]}歳
                    </div>
                    <div>
                      <span className="font-medium">性別傾向：</span>
                      {selectedDisorder.genderBias > 0.5 
                        ? `女性が多い（${Math.round(selectedDisorder.genderBias * 100)}%）`
                        : selectedDisorder.genderBias < 0.5
                        ? `男性が多い（${Math.round((1 - selectedDisorder.genderBias) * 100)}%）`
                        : '性差なし'}
                    </div>
                    {selectedDisorder.unilateral && (
                      <div className="text-orange-600 font-medium">
                        多くは一側性
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 右側：詳細情報 */}
          <div className="lg:col-span-2">
            {selectedDisorder ? (
              <div className="bg-white rounded-xl shadow-lg p-6">
                <div className="mb-4">
                  <h2 className="text-xl font-semibold mb-2">{selectedDisorder.name}</h2>
                  {selectedDisorder && (
                    <div className="flex items-center space-x-4 text-sm text-gray-600">
                      <div>
                        <span className="font-medium">パターン：</span> {selectedDisorder.pattern}
                      </div>
                      <div>
                        <span className="font-medium">年齢：</span> 
                        {selectedDisorder.ageRange[0]}〜{selectedDisorder.ageRange[1]}歳
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  {/* 疫学データ */}
                  <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                    <h3 className="text-sm font-semibold text-blue-800 mb-2">疫学データ</h3>
                    <p className="text-sm text-gray-700">
                      {selectedDisorder.epidemiology}
                    </p>
                  </div>

                  {/* オーディオグラム特徴 */}
                  <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                    <h3 className="text-sm font-semibold text-green-800 mb-2">オーディオグラム特徴</h3>
                    <p className="text-sm text-gray-700">
                      {selectedDisorder.audiogram}
                    </p>
                  </div>

                  {/* 検査所見 */}
                  <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
                    <h3 className="text-sm font-semibold text-purple-800 mb-2">検査所見</h3>
                    <div className="space-y-2 text-sm text-gray-700">
                      <div>
                        <span className="font-medium">ティンパノグラム：</span> {selectedDisorder.tympanometry}
                      </div>
                      <div>
                        <span className="font-medium">あぶみ骨筋反射：</span> {selectedDisorder.stapedial_reflex}
                      </div>
                      <div>
                        <span className="font-medium">OAE：</span> {selectedDisorder.oae}
                      </div>
                    </div>
                  </div>

                  {/* 典型的なエピソード */}
                  {selectedDisorder.episodes && selectedDisorder.episodes.length > 0 && (
                    <div className="bg-yellow-50 rounded-lg p-4 border border-yellow-200">
                      <h3 className="text-sm font-semibold text-yellow-800 mb-2">典型的なエピソード・症状</h3>
                      <ul className="space-y-1">
                        {selectedDisorder.episodes.map((episode, index) => (
                          <li key={index} className="text-sm text-gray-700">
                            • {episode}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-xl shadow-lg p-12 text-center">
                <div className="text-gray-400 text-6xl mb-4">📚</div>
                <h3 className="text-xl font-semibold text-gray-600 mb-2">
                  疾患を選択してください
                </h3>
                <p className="text-gray-500">
                  左側のリストから疾患を選択すると、詳細情報が表示されます
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
