import { p, h1, h2, h3, box, table, run } from './docx-kit.mjs';
import { buildDoc } from './render-student.mjs';
import {
  formula, maskingAnswerTable, boneConductionPlateau,
  plateauWidthFromAbg,
} from './masking.mjs';

const FILL = { info: 'E8F0FA', warn: 'FFF4E0' };
const EAR_JA = { right: '右', left: '左' };

/** Q4-3 の正答表を代表閾値から計算して描く。手入力の正答は持たない。 */
function renderMaskingAnswer(c) {
  const m = c.masking;
  const rows = maskingAnswerTable(c);
  const cols = rows.map((r) => r.label);
  const labelW = 3400;
  const each = Math.floor((9020 - labelW) / cols.length);
  const widths = [labelW, ...cols.map((_, i) => (i === cols.length - 1 ? 9020 - labelW - each * (cols.length - 1) : each))];

  const out = [];
  out.push(p([run('Q4-3　骨導のマスキング計算：', { bold: true }), run('生成値により多少変動するが、代表的な値は次のとおり。')]));
  out.push(table(widths, [
    ['項目', ...cols],
    [`検耳（${EAR_JA[m.testEar]}）の骨導閾値`, ...rows.map((r) => String(r.bcTestEar))],
    ['①　マスキング負荷量（非検耳へ）', ...rows.map((r) => String(r.min))],
    ['②　最大マスキング量', ...rows.map((r) => String(r.max))],
    ['③　プラトー幅', ...rows.map((r) => String(r.width))],
    ['④　プラトーは取れるか', ...rows.map((r) => (r.plateauObtainable ? '○' : '×'))],
  ], { center: true }));

  const r0 = rows[0];
  out.push(p(`①＝検耳骨導 ${r0.bcTestEar}＋安全域 ${m.safetyMargin}＝${r0.min} dB を非検耳（${EAR_JA[m.nonTestEar]}）に負荷する。②＝${r0.bcTestEar}＋${m.interauralAttenuationAC}−${m.safetyMargin}＝${r0.max}、③＝${r0.width}（IA − 2×安全域）。実測の骨導が異なれば、学生の実測から同じ式で計算した値を正答とする。`));
  out.push(box([
    '負荷量は検耳の骨導＋安全域であり、非検耳の気導では決めない。',
    `本課題の設定（IA ${m.interauralAttenuationAC}、安全域 ${m.safetyMargin}）ではプラトー幅は ${m.interauralAttenuationAC - 2 * m.safetyMargin} dB で、ABG によっては変わらない。`,
  ], FILL.info));
  return out;
}

/** Q6-4（ABG 40 dB のとき）の正答も計算で出す。 */
function computedAnswer(key, c) {
  const m = c.masking;
  if (key === 'plateauAtAbg40') {
    const abg = 40;
    const bcTestEar = c.representativeThresholds.bc[m.testEar]['500'];
    const r = boneConductionPlateau({ bcTestEar, masking: m });
    return `検耳骨導 ${bcTestEar} dB のとき、非検耳への負荷量は ${bcTestEar}＋${m.safetyMargin}＝${r.min} dB。ABG が ${abg} dB でもこの量は変わらない。②＝${bcTestEar}＋${m.interauralAttenuationAC}−${m.safetyMargin}＝${r.max}、③＝${r.width} dB（IA − 2×安全域＝${plateauWidthFromAbg(abg, m)}）。`;
  }
  return null;
}

function renderQuestionAnswer(q, c) {
  const out = [];
  const computed = q.computed ? computedAnswer(q.computed, c) : null;
  const texts = computed ? [computed, ...(q.answer || [])] : (q.answer || []);

  if (texts.length) {
    out.push(p([run(`${q.id}　`, { bold: true }), run(texts[0])]));
    texts.slice(1).forEach((t) => out.push(p(t)));
  }
  if (q.answerTable) {
    out.push(table(q.answerTable.widths, [q.answerTable.header, ...q.answerTable.rows]));
  }
  if (q.answerBox) {
    out.push(box(q.answerBox.lines, FILL[q.answerBox.fill] || FILL.info));
  }
  return out;
}

export function renderTeacher(c) {
  const m = c.masking;
  const t = c.teaching;
  const F = [];

  F.push(h1(`${c.title}　教員用`));
  F.push(p([run(`${c.diagnosis}／レベル${c.level}／AudioScope EDU 連動`, { size: 20, color: '555555' })], { after: 160 }));

  F.push(h2('この症例で教えたいこと'));
  F.push(box([`中心の狙い：${t.coreMessage}`], FILL.info));
  t.rationale.forEach((x) => F.push(p(x)));
  F.push(h3(t.orderRationale.title));
  t.orderRationale.paragraphs.forEach((x) => F.push(p(x)));
  F.push(h3('副次的な狙い'));
  F.push(p(t.secondaryAims));

  F.push(h2('EDU 設定パラメータ', { newPage: true }));
  const g = c.generation;
  F.push(table([2600, 6420], [
    ['項目', '設定'],
    ['聴力像パターン', `${c.diagnosis}（profile: ${g.profile}）`],
    ['年齢群', g.ageGroup],
    ['性別', g.sex === 'female' ? '女性' : '男性'],
    ['難聴の程度', String(g.severity)],
    ['側', g.ears === 'both' ? '両耳' : g.ears],
    ['乱数初期値（seed）', String(g.seed)],
  ]));
  F.push(p(t.expectedOutput));
  F.push(box([t.seedWarning], FILL.warn));
  F.push(p([run('この表は cases/' + c.id + '.json の generation 節から自動生成されている。値を変えるときは JSON を編集し、build を再実行すること。シートと EDU の条件がずれることはない。', { size: 18, color: '555555' })]));

  F.push(h2('マスキングの前提（学生シートと同一）'));
  F.push(table([3000, 6020], [
    ['項目', '本課題での設定'],
    ['両耳間減衰量（IA）', `気導 ${m.interauralAttenuationAC} dB（周波数によらず一律）／骨導 ${m.interauralAttenuationBC} dB`],
    ['安全域', `${m.safetyMargin} dB`],
    ['閉鎖効果（OE）補正', m.occlusionCorrection ? '加える' : '加えない'],
  ]));
  F.push(p(`IA は実際には周波数と受話器の種類（ヘッドホンかインサートイヤホンか）によって幅があり、単一の値として確定していない。本課題では学科の運用に合わせて ${m.interauralAttenuationAC} dB に固定している。安全域 ${m.safetyMargin} dB および OE 補正を加えない扱いも教育用の設定であり、教科書の流儀に合わせて差し替えてよい。差し替えは cases/${c.id}.json の masking 節で行い、正答値は build/masking.mjs が自動で再計算する。`));

  F.push(h2('段階別の解答', { newPage: true }));
  for (const s of c.stages) {
    F.push(h3(`${s.id}　${s.title}`));
    if (s.showAirMaskingCheck) {
      F.push(p([run('Q4-1　', { bold: true }), run('EDU の正答照合で確認。5 dB 以内の一致を許容範囲とする。')]));
      const ia = m.interauralAttenuationAC;
      const ears = ['right', 'left'];
      const airLines = ears.map((ear) => {
        const other = ear === 'right' ? 'left' : 'right';
        const ac = c.representativeThresholds.ac[ear]['1000'];
        const bc = c.representativeThresholds.bc[other]['1000'];
        const diff = ac - bc;
        const need = diff >= ia;
        const bcTest = c.representativeThresholds.bc[ear]['1000'];
        const load = bcTest + m.safetyMargin;
        return `${EAR_JA[ear]}検耳：気導 ${ac} − 反対耳骨導 ${bc} ＝ ${diff} dB（IA ${ia}）→ ${need ? '要' : '不要'}。要のときの負荷量は検耳骨導 ${bcTest}＋安全域 ${m.safetyMargin}＝${load} dB を反対耳へ。`;
      });
      F.push(p([run('Q4-2　気導の交差聴取（1 kHz）：', { bold: true }), run(airLines.join(' '))]));
      F.push(p([run('採点の要点：', { bold: true }), run('結論よりも差の計算を見る。「伝音難聴だから不要」は誤った一般化なので減点する。負荷量を非検耳の気導＋安全域で書いた答案は減点し、検耳骨導＋安全域に直させる。')]));
    }
    if (s.showBoneMaskingCalc) F.push(...renderMaskingAnswer(c));
    for (const q of s.questions || []) F.push(...renderQuestionAnswer(q, c));
  }

  F.push(h2('想定誤答と対応', { newPage: true }));
  F.push(table([3500, 900, 4620], [['誤答', '頻度', '対応'], ...c.commonErrors]));

  F.push(h2(`評価ルーブリック（${c.rubric.total}点）`, { newPage: true }));
  F.push(table([2000, 2340, 2340, 2340], [['軸', '5点', '3点', '1点'], ...c.rubric.rows]));
  F.push(box([c.rubric.passNote], FILL.info));

  F.push(h2('実施上の注意（要確認事項）', { newPage: true }));
  F.push(p('以下は EDU の実装状況に依存する。運用前に確認すること。'));
  F.push(table([700, 8320], [
    ['', '確認事項'],
    ...c.implementationNotes.map((n, i) => [String(i + 1), n]),
  ]));

  F.push(h2('数値の扱いについて'));
  c.valueNotes.forEach((x) => F.push(p(x)));

  return buildDoc(F, `${c.title}　教員用（解答・解説）`);
}
