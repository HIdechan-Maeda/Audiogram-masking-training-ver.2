/** DPOAE f2 測定周波数（kHz）。EDU 画面・書き出し・課題シートで同一であること。 */
export const DPOAE_F2_KHZ = Object.freeze([1, 2, 3, 4, 6, 8]);

export const DPOAE_FREQ_LABELS = Object.freeze(DPOAE_F2_KHZ.map((f) => `${f}k`));

export function assertDpoaeFrequencyLabels(labels, context = 'DPOAE') {
  const got = Array.isArray(labels) ? labels.map(String) : [];
  const exp = [...DPOAE_FREQ_LABELS];
  if (got.length !== exp.length || got.some((v, i) => v !== exp[i])) {
    throw new Error(
      `${context}: DPOAE 周波数が EDU と不一致です。期待 ${exp.join(',')}／実際 ${got.join(',') || '(なし)'}`
    );
  }
}
