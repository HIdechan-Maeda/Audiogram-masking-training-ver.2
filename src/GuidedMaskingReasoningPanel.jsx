import React, { useMemo, useState, useEffect } from 'react';
import {
  GUIDED_STEPS,
  NEED_REASON_OPTIONS,
  getContextThresholds,
  evaluateMaskNeed,
  suggestInitialMaskLevel,
  isOverMasking,
  scoreNeedAnswer,
} from './guidedMaskingLogic';

/**
 * ガイド付きマスキング推論モード UI
 * 親の測定条件（耳・変換器・周波数・マスク量）と連動する。
 */
export default function GuidedMaskingReasoningPanel({
  active,
  onActiveChange,
  ear,
  trans,
  freq,
  maskLevel,
  masked,
  targets,
  iaAC = 50,
  iaBC = 0,
  onApplyMask,
  onSetMasked,
}) {
  const [stepIndex, setStepIndex] = useState(0);
  const [needChoice, setNeedChoice] = useState(null); // true | false | null
  const [selectedReasons, setSelectedReasons] = useState([]);
  const [needFeedback, setNeedFeedback] = useState(null);
  const [pickedInitial, setPickedInitial] = useState(null);
  const [plateauChecks, setPlateauChecks] = useState({
    raised: false,
    stable: false,
    threeSame: false,
  });
  const [reflection, setReflection] = useState('');
  const [sessionLog, setSessionLog] = useState([]);

  const step = GUIDED_STEPS[stepIndex];

  const thr = useMemo(
    () => getContextThresholds(targets || [], ear, freq),
    [targets, ear, freq]
  );

  const evaluation = useMemo(
    () =>
      evaluateMaskNeed({
        transducer: trans,
        teAC: thr.teAC,
        teBC: thr.teBC,
        nteBC: thr.nteBC,
        iaAC,
        iaBC,
      }),
    [trans, thr, iaAC, iaBC]
  );

  const suggestions = useMemo(
    () =>
      suggestInitialMaskLevel({
        transducer: trans,
        teAC: thr.teAC,
        nteAC: thr.nteAC,
        nteBC: thr.nteBC,
        ia: iaAC,
        margin: 10,
      }),
    [trans, thr, iaAC]
  );

  const overMask = isOverMasking(maskLevel, thr.teBC);

  // 症例・周波数・耳が変わったら要否ステップへ戻す（モードON時）
  useEffect(() => {
    if (!active) return;
    setStepIndex(0);
    setNeedChoice(null);
    setSelectedReasons([]);
    setNeedFeedback(null);
    setPickedInitial(null);
    setPlateauChecks({ raised: false, stable: false, threeSame: false });
    setReflection('');
  }, [active, ear, trans, freq, targets]);

  function toggleReason(id) {
    setSelectedReasons((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function submitNeed() {
    if (needChoice == null) return;
    const scored = scoreNeedAnswer(needChoice, evaluation);
    setNeedFeedback(scored);
    setSessionLog((prev) => [
      ...prev,
      {
        at: new Date().toISOString(),
        step: 'need',
        ear,
        freq,
        trans,
        choice: needChoice,
        reasons: selectedReasons,
        ok: scored.ok,
      },
    ]);
  }

  function applySuggestion(value) {
    setPickedInitial(value);
    if (typeof onApplyMask === 'function') {
      onApplyMask(value);
    }
    if (typeof onSetMasked === 'function') {
      onSetMasked(true);
    }
  }

  function finishSession() {
    setSessionLog((prev) => [
      ...prev,
      {
        at: new Date().toISOString(),
        step: 'confirm',
        ear,
        freq,
        trans,
        maskLevel,
        reflection,
        plateauChecks,
      },
    ]);
    setStepIndex(0);
    setNeedChoice(null);
    setSelectedReasons([]);
    setNeedFeedback(null);
    setPickedInitial(null);
    setPlateauChecks({ raised: false, stable: false, threeSame: false });
    setReflection('');
  }

  const plateauDone =
    plateauChecks.raised && plateauChecks.stable && plateauChecks.threeSame;

  if (!active) {
    return (
      <div className="bg-white rounded-2xl shadow p-4 border border-dashed border-teal-300">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="font-semibold text-teal-900">ガイド付きマスキング推論モード</div>
            <p className="text-sm text-gray-600 mt-1">
              要否 → 初期量 → プラトー → 振り返りの順で、公式暗記ではなく判断の順番を練習します。
            </p>
          </div>
          <button
            type="button"
            onClick={() => onActiveChange(true)}
            className="px-4 py-2 rounded-xl bg-teal-600 text-white text-sm font-medium hover:bg-teal-700"
          >
            モードを開始
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow border border-teal-200 overflow-hidden">
      <div className="bg-teal-700 text-white px-5 py-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="font-semibold">ガイド付きマスキング推論モード</div>
          <div className="text-xs text-teal-100 mt-0.5">
            測定耳 {ear === 'R' ? '右' : '左'} ／ {trans} ／ {freq} Hz
            {masked ? ` ／ マスク ${maskLevel} dB` : ' ／ マスク OFF'}
          </div>
        </div>
        <button
          type="button"
          onClick={() => onActiveChange(false)}
          className="px-3 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-sm"
        >
          終了
        </button>
      </div>

      {/* ステップインジケータ */}
      <div className="px-5 pt-4 flex flex-wrap gap-2">
        {GUIDED_STEPS.map((s, i) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setStepIndex(i)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border ${
              i === stepIndex
                ? 'bg-teal-600 text-white border-teal-600'
                : i < stepIndex
                  ? 'bg-teal-50 text-teal-800 border-teal-200'
                  : 'bg-gray-50 text-gray-500 border-gray-200'
            }`}
          >
            {s.short}
          </button>
        ))}
      </div>

      <div className="p-5 grid gap-4 lg:grid-cols-[1fr_280px]">
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">{step.title}</h3>
            <p className="text-sm text-gray-600 mt-1">{step.prompt}</p>
          </div>

          {/* ① 要否 */}
          {step.id === 'need' && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setNeedChoice(true)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium border ${
                    needChoice === true
                      ? 'bg-teal-600 text-white border-teal-600'
                      : 'bg-white text-gray-800 border-gray-300 hover:border-teal-400'
                  }`}
                >
                  必要
                </button>
                <button
                  type="button"
                  onClick={() => setNeedChoice(false)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium border ${
                    needChoice === false
                      ? 'bg-amber-600 text-white border-amber-600'
                      : 'bg-white text-gray-800 border-gray-300 hover:border-amber-400'
                  }`}
                >
                  不要（当面）
                </button>
              </div>

              <div>
                <div className="text-xs font-semibold text-gray-500 mb-2">判断理由（複数可）</div>
                <div className="space-y-2">
                  {NEED_REASON_OPTIONS.map((opt) => (
                    <label
                      key={opt.id}
                      className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={selectedReasons.includes(opt.id)}
                        onChange={() => toggleReason(opt.id)}
                      />
                      <span>{opt.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <button
                type="button"
                disabled={needChoice == null}
                onClick={submitNeed}
                className="px-4 py-2 rounded-xl bg-teal-600 text-white text-sm disabled:opacity-40"
              >
                判定を確認
              </button>

              {needFeedback && (
                <div
                  className={`rounded-xl p-3 text-sm ${
                    needFeedback.ok === true
                      ? 'bg-green-50 text-green-900 border border-green-200'
                      : needFeedback.ok === false
                        ? 'bg-rose-50 text-rose-900 border border-rose-200'
                        : 'bg-slate-50 text-slate-800 border border-slate-200'
                  }`}
                >
                  {needFeedback.message}
                  <div className="mt-2 text-xs opacity-90">{evaluation.detail}</div>
                  <button
                    type="button"
                    className="mt-3 text-xs font-medium underline"
                    onClick={() => setStepIndex(1)}
                  >
                    次へ：初期マスク量 →
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ② 初期量 */}
          {step.id === 'initial' && (
            <div className="space-y-3">
              <p className="text-sm text-gray-600">
                提案値を選ぶと、マスキング ON とレベルがオージオ操作に反映されます。その後、ランプ／クロスヒア表示で妥当性を確認してください。
              </p>
              {suggestions.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => applySuggestion(s.value)}
                  className={`w-full text-left px-4 py-3 rounded-xl border ${
                    pickedInitial === s.value
                      ? 'border-teal-500 bg-teal-50'
                      : 'border-gray-200 hover:border-teal-300 bg-white'
                  }`}
                >
                  <div className="font-medium text-gray-900">
                    {s.label}: <span className="text-teal-700">{s.value} dB HL</span>
                  </div>
                  <div className="text-xs text-gray-500 mt-1">{s.formula}</div>
                </button>
              ))}
              {overMask && (
                <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
                  現在のマスク量はオーバーマスキングの可能性があります（測定耳BC + 50 dB 超）。下げて再検討してください。
                </div>
              )}
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setStepIndex(0)}
                  className="px-3 py-2 rounded-lg border text-sm"
                >
                  ← 戻る
                </button>
                <button
                  type="button"
                  onClick={() => setStepIndex(2)}
                  className="px-3 py-2 rounded-lg bg-teal-600 text-white text-sm"
                >
                  次へ：プラトー →
                </button>
              </div>
            </div>
          )}

          {/* ③ プラトー */}
          {step.id === 'plateau' && (
            <div className="space-y-3">
              <ol className="list-decimal list-inside text-sm text-gray-700 space-y-1">
                <li>マスクを 5 dB 上げる</li>
                <li>同じ刺激レベルで反応が変わらないか確認する</li>
                <li>閾値が変わらないままマスクを上げられる帯域（プラトー）を探す</li>
              </ol>
              <div className="space-y-2">
                {[
                  { key: 'raised', label: 'マスクを +5 dB した' },
                  { key: 'stable', label: '反応／閾値が安定していることを確認した' },
                  { key: 'threeSame', label: '十分なプラトー（教育上の自己チェック）を得た' },
                ].map((item) => (
                  <label key={item.key} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={plateauChecks[item.key]}
                      onChange={(e) =>
                        setPlateauChecks((prev) => ({ ...prev, [item.key]: e.target.checked }))
                      }
                    />
                    {item.label}
                  </label>
                ))}
              </div>
              <p className="text-xs text-gray-500">
                ※ 実際のマスク量変更は上部のマスキングスライダーで行ってください（現在 {masked ? `${maskLevel} dB` : 'OFF'}）。
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setStepIndex(1)}
                  className="px-3 py-2 rounded-lg border text-sm"
                >
                  ← 戻る
                </button>
                <button
                  type="button"
                  disabled={!plateauDone}
                  onClick={() => setStepIndex(3)}
                  className="px-3 py-2 rounded-lg bg-teal-600 text-white text-sm disabled:opacity-40"
                >
                  次へ：振り返り →
                </button>
              </div>
            </div>
          )}

          {/* ④ 振り返り */}
          {step.id === 'confirm' && (
            <div className="space-y-3">
              <label className="block text-sm text-gray-700">
                この周波数で、なぜその要否・マスク量にしたか（1〜3文）
                <textarea
                  value={reflection}
                  onChange={(e) => setReflection(e.target.value)}
                  rows={3}
                  className="mt-1 w-full border rounded-xl px-3 py-2 text-sm"
                  placeholder="例: 右AC 1000 Hz で TE−IA が左BCを超えそうなのでマスクし、NTE_AC+10 から開始してプラトーを確認した。"
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setStepIndex(2)}
                  className="px-3 py-2 rounded-lg border text-sm"
                >
                  ← 戻る
                </button>
                <button
                  type="button"
                  disabled={reflection.trim().length < 8}
                  onClick={finishSession}
                  className="px-4 py-2 rounded-xl bg-teal-600 text-white text-sm disabled:opacity-40"
                >
                  この周波数の推論を完了
                </button>
              </div>
              {sessionLog.length > 0 && (
                <p className="text-xs text-gray-500">
                  セッションログ: {sessionLog.length} 件（ブラウザ内のみ・今後DB連携可）
                </p>
              )}
            </div>
          )}
        </div>

        {/* 右カラム：数値コンテキスト */}
        <aside className="rounded-xl bg-slate-50 border border-slate-200 p-4 text-sm space-y-3 h-fit">
          <div className="font-semibold text-slate-800">いま使える数値</div>
          <dl className="space-y-1.5 text-slate-700">
            <div className="flex justify-between gap-2">
              <dt>測定耳 AC</dt>
              <dd className="font-mono">{fmt(thr.teAC)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>測定耳 BC</dt>
              <dd className="font-mono">{fmt(thr.teBC)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>非検査耳({thr.nte}) AC</dt>
              <dd className="font-mono">{fmt(thr.nteAC)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>非検査耳({thr.nte}) BC</dt>
              <dd className="font-mono">{fmt(thr.nteBC)}</dd>
            </div>
            <div className="flex justify-between gap-2 border-t border-slate-200 pt-2 mt-2">
              <dt>IA ({trans})</dt>
              <dd className="font-mono">{trans === 'AC' ? iaAC : iaBC} dB</dd>
            </div>
          </dl>
          <p className="text-xs text-slate-500 leading-relaxed">
            数値はロード済み症例の正答ターゲットから参照します。症例未ロードのときは要否の自動判定が弱くなります。
          </p>
          <div className="text-xs rounded-lg bg-white border border-slate-200 p-2 text-slate-600">
            <div className="font-medium text-slate-800 mb-1">教育用ルール</div>
            {evaluation.rule}
          </div>
        </aside>
      </div>
    </div>
  );
}

function fmt(v) {
  return v == null ? '—' : `${v} dB`;
}
