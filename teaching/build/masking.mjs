/**
 * マスキング量の計算。
 *
 * 教材（課題シートの正答）と AudioScope EDU の双方がこの 1 ファイルを参照すること。
 * 式を変えるときはここだけを変える。学生シートに印刷される式も render-student.mjs が
 * ここの FORMULA_TEXT を読むので、シートと計算が食い違うことはない。
 *
 * すべて教育用の設定であり、臨床の基準値ではない。IA・安全域・OE 補正の扱いは
 * 学科で採用している教科書の流儀に合わせて cases/*.json の masking 節で変更する。
 */

export const FORMULA_TEXT = {
  airCrossCheck:
    '判定式：　検耳の気導閾値　−　非検耳の骨導閾値　≧　IA（{{ia}} dB）　→　マスキング必要',
  boneMin:
    '①　最小有効マスキング量　＝　非検耳の気導閾値　＋　安全域（{{safety}} dB）',
  boneMax:
    '②　最大マスキング量（オーバーマスキング開始）　＝　検耳の骨導閾値　＋　IA（{{ia}} dB）　−　安全域（{{safety}} dB）',
  plateau:
    '③　プラトー幅　＝　②　−　①',
};

export function formula(key, masking) {
  return FORMULA_TEXT[key]
    .replace('{{ia}}', String(masking.interauralAttenuationAC))
    .replace('{{safety}}', String(masking.safetyMargin));
}

/**
 * 気導の交差聴取判定。
 * @returns {{ diff:number, maskingNeeded:boolean }}
 */
export function airConductionCrossCheck({ acTestEar, bcNonTestEar, masking }) {
  const diff = acTestEar - bcNonTestEar;
  return { diff, maskingNeeded: diff >= masking.interauralAttenuationAC };
}

/**
 * 骨導マスキングのプラトー計算。
 * @returns {{ min:number, max:number, width:number, plateauObtainable:boolean }}
 */
export function boneConductionPlateau({ acNonTestEar, bcTestEar, masking }) {
  const ia = masking.interauralAttenuationAC;
  const safety = masking.safetyMargin;
  const min = acNonTestEar + safety;
  const max = bcTestEar + ia - safety;
  const width = max - min;
  return { min, max, width, plateauObtainable: width > 0 };
}

/**
 * 両耳対称を仮定したときのプラトー幅の一般形。
 *   プラトー幅 ＝ IA − ABG − 2×安全域
 * 本課題の設定（IA 50 / 安全域 10）では「30 − ABG」となり、ABG が 30 dB に達すると
 * プラトーが消える。レベル2（耳硬化症・耳小骨連鎖離断）の伏線。
 * この式は教員用にのみ出力し、学生シートには印刷しない。
 */
export function plateauWidthFromAbg(abg, masking) {
  return masking.interauralAttenuationAC - abg - 2 * masking.safetyMargin;
}

export function dilemmaThresholdAbg(masking) {
  return masking.interauralAttenuationAC - 2 * masking.safetyMargin;
}

/** 症例の代表閾値から、シートの周波数ごとの正答表を作る。 */
export function maskingAnswerTable(caseDef) {
  const m = caseDef.masking;
  const test = m.testEar;
  const nonTest = m.nonTestEar;
  const ac = caseDef.representativeThresholds.ac[nonTest];
  const bc = caseDef.representativeThresholds.bc[test];

  return m.frequencies.map((f) => {
    const key = String(f);
    const acNonTestEar = ac[key];
    const bcTestEar = bc[key];
    const r = boneConductionPlateau({ acNonTestEar, bcTestEar, masking: m });
    return {
      frequency: f,
      label: f >= 1000 ? `${f / 1000} kHz` : `${f} Hz`,
      acNonTestEar,
      bcTestEar,
      ...r,
    };
  });
}
