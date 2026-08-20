/**
 * ガイド付きマスキング推論モード — 判定ロジック（教育用）
 * Audioscope EDU の IA（既定 AC=50 / BC=0）および古典的クロスオーバー規則に合わせる。
 */

export const GUIDED_STEPS = [
  {
    id: 'need',
    title: '要否判定',
    short: '①要否',
    prompt: 'この測定条件で、非検査耳へのマスキングは必要ですか？',
  },
  {
    id: 'initial',
    title: '初期マスク量',
    short: '②初期量',
    prompt: '推奨の初期マスキングレベルを決め、オージオ上に適用してください。',
  },
  {
    id: 'plateau',
    title: 'プラトー法',
    short: '③プラトー',
    prompt: 'マスクを段階的に上げ、閾値が安定する（プラトー）ことを確認します。',
  },
  {
    id: 'confirm',
    title: '確定・振り返り',
    short: '④振り返り',
    prompt: '判断の根拠を言語化し、この周波数の推論を完了します。',
  },
];

export const NEED_REASON_OPTIONS = [
  { id: 'crossover', label: '刺激−IA が非検査耳BCに達しうる（クロスオーバー）' },
  { id: 'abg', label: '気骨導差が大きく、真の閾値確認が必要' },
  { id: 'asymmetry', label: '左右差が大きく、非検査耳の寄与が疑わしい' },
  { id: 'bc_default', label: '骨導測定のため、原則マスキングを検討' },
  { id: 'not_needed', label: 'クロスオーバーの恐れは小さく、当面マスク不要' },
];

/**
 * @param {Array} targets - { ear, transducer, freq, dB, so? }[]
 */
export function lookupThreshold(targets, ear, transducer, freq) {
  if (!Array.isArray(targets) || !targets.length) return null;
  const hit = targets.find(
    (t) => t.ear === ear && t.transducer === transducer && t.freq === freq && !t.so
  );
  if (hit && typeof hit.dB === 'number') return hit.dB;
  const soHit = targets.find(
    (t) => t.ear === ear && t.transducer === transducer && t.freq === freq && t.so
  );
  if (soHit) return null; // scale-out → 不明扱い
  return null;
}

export function getContextThresholds(targets, ear, freq) {
  const nte = ear === 'R' ? 'L' : 'R';
  return {
    teAC: lookupThreshold(targets, ear, 'AC', freq),
    teBC: lookupThreshold(targets, ear, 'BC', freq),
    nteAC: lookupThreshold(targets, nte, 'AC', freq),
    nteBC: lookupThreshold(targets, nte, 'BC', freq),
    nte,
  };
}

/**
 * 教育用・要否の「正解」推定
 * AC: TE_AC − IA_AC ≥ NTE_BC なら要マスク
 * BC: IA_BC が小さい前提で、原則要マスク（TE_BC − IA_BC ≥ NTE_BC）
 */
export function evaluateMaskNeed({
  transducer,
  teAC,
  teBC,
  nteBC,
  iaAC = 50,
  iaBC = 0,
}) {
  if (transducer === 'AC') {
    if (teAC == null || nteBC == null) {
      return {
        needed: null,
        rule: '閾値不足',
        detail: '測定耳ACまたは非検査耳BCが未確定のため、要否を自動判定できません。症例ロード後に再試行してください。',
        crossoverLevel: null,
      };
    }
    const crossoverLevel = teAC - iaAC;
    const needed = crossoverLevel >= nteBC;
    return {
      needed,
      rule: 'AC: TE_AC − IA ≥ NTE_BC',
      detail: needed
        ? `TE_AC(${teAC}) − IA(${iaAC}) = ${crossoverLevel} ≥ NTE_BC(${nteBC}) → マスク推奨`
        : `TE_AC(${teAC}) − IA(${iaAC}) = ${crossoverLevel} < NTE_BC(${nteBC}) → 当面マスク不要の見込み`,
      crossoverLevel,
    };
  }

  // BC
  if (teBC == null || nteBC == null) {
    return {
      needed: true,
      rule: 'BC: 原則検討',
      detail: '骨導はIAが小さいため、閾値が揃っていなくてもマスキングを検討するのが安全です（教育上の既定）。',
      crossoverLevel: teBC != null ? teBC - iaBC : null,
    };
  }
  const crossoverLevel = teBC - iaBC;
  const strictlyNeeded = crossoverLevel >= nteBC;
  return {
    needed: true, // 教育上BCは原則マスクを推奨（厳密比較は strictlyNeeded）
    rule: 'BC: 原則マスク（参考: TE_BC − IA_BC ≥ NTE_BC）',
    detail: `TE_BC(${teBC}) − IA(${iaBC}) = ${crossoverLevel} と NTE_BC(${nteBC}) の比較は ${strictlyNeeded ? '要マスク寄り' : '境界付近'}。骨導では原則マスクを推奨します。`,
    crossoverLevel,
    strictlyNeeded,
  };
}

/**
 * 初期マスク量の教育用提案（HL）
 * シラバス案: TE_AC + margin − IA（AC刺激時）
 * NTE_AC が分かる場合は NTE_AC + 10 も併記
 */
export function suggestInitialMaskLevel({
  transducer,
  teAC,
  nteAC,
  nteBC,
  ia = 50,
  margin = 10,
}) {
  const suggestions = [];

  if (transducer === 'AC' && teAC != null) {
    const fromTe = teAC + margin - ia;
    suggestions.push({
      id: 'te_formula',
      label: `TE_AC + ${margin} − IA`,
      value: clampMask(fromTe),
      formula: `${teAC} + ${margin} − ${ia} = ${fromTe}`,
    });
  }

  if (nteAC != null) {
    const fromNte = nteAC + 10;
    suggestions.push({
      id: 'nte_plus10',
      label: 'NTE_AC + 10',
      value: clampMask(fromNte),
      formula: `${nteAC} + 10 = ${fromNte}`,
    });
  }

  if (nteBC != null) {
    const minEff = nteBC + 5;
    suggestions.push({
      id: 'min_effective',
      label: 'NTE_BC + 5（最小有効の目安）',
      value: clampMask(minEff),
      formula: `${nteBC} + 5 = ${minEff}`,
    });
  }

  if (!suggestions.length) {
    suggestions.push({
      id: 'default',
      label: '既定スタート',
      value: 40,
      formula: '閾値不足のため 40 dB HL から開始（要調整）',
    });
  }

  return suggestions;
}

export function isOverMasking(maskLevel, teBC, iaToTe = 50) {
  if (typeof maskLevel !== 'number' || maskLevel <= -15) return false;
  if (teBC == null) return false;
  // アプリ本体: maskingLimit ≈ teBC + 50
  return maskLevel > teBC + iaToTe;
}

function clampMask(v) {
  const stepped = Math.round(v / 5) * 5;
  return Math.max(0, Math.min(100, stepped));
}

export function scoreNeedAnswer(studentNeeded, evaluation) {
  if (evaluation.needed == null) {
    return { ok: null, message: '自動正解が未確定です。理由の言語化を優先してください。' };
  }
  // BCは原則マスク寄り: student yes を正とする
  const expected = evaluation.needed;
  const ok = studentNeeded === expected;
  return {
    ok,
    message: ok
      ? '要否の判断は、教育用ルールと一致しています。'
      : `教育用ルールでは「${expected ? '必要' : '不要'}」です。右の解説を読み、オージオでクロスヒアを確認してください。`,
  };
}
