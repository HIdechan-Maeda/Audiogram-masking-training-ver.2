import { Document, Paragraph, Header, Footer, AlignmentType, PageNumber, TextRun, BorderStyle } from 'docx';
import { p, h1, h2, h3, box, lines, table, spacer, run, FONT } from './docx-kit.mjs';
import { formula } from './masking.mjs';

const FILL = { info: 'E8F0FA', warn: 'FFF4E0', plain: 'F2F2F2' };

function freqLabel(f) {
  return f >= 1000 ? `${f / 1000} kHz` : `${f} Hz`;
}

/** 設問の記入欄を描く */
function answerSpace(space) {
  if (!space) return [];
  if (space.type === 'lines') {
    return lines(space.count, space.height ? { height: space.height } : {});
  }
  if (space.type === 'fillTable') {
    const rows = space.headerOnly ? [space.header] : [space.header, ...space.rows];
    return [table(space.widths, rows, {
      blankHeight: space.rowHeight,
      center: space.center,
      header: !space.headerOnly,
    })];
  }
  return [];
}

function renderQuestion(q) {
  const out = [];
  out.push(h3(`${q.id}　${q.prompt}`, { keepNext: true }));
  if (q.note) out.push(p([run(q.note, { size: 18, color: '555555' })], { before: 0, after: 80 }));
  if (q.quote) out.push(box([q.quote], FILL.warn));
  if (q.choices) {
    out.push(p(q.choices));
    out.push(spacer(60));
  }
  out.push(...answerSpace(q.space));
  return out;
}

function renderThresholdEntry() {
  const out = [];
  out.push(h3('Q4-1　測定した閾値を記入してください。', { keepNext: true }));
  out.push(p([run('気導（dB HL）', { size: 19, bold: true })], { before: 80, after: 60 }));
  out.push(table([1180, 1120, 1120, 1120, 1120, 1120, 1120, 1120], [
    ['', '125', '250', '500', '1k', '2k', '4k', '8k'],
    ['右', '', '', '', '', '', '', ''],
    ['左', '', '', '', '', '', '', ''],
  ], { center: true, blankHeight: 400 }));
  out.push(p([run('骨導（dB HL）', { size: 19, bold: true })], { before: 140, after: 60 }));
  out.push(table([1520, 1500, 1500, 1500, 1500, 1500], [
    ['', '250', '500', '1k', '2k', '4k'],
    ['右', '', '', '', '', ''],
    ['左', '', '', '', '', ''],
  ], { center: true, blankHeight: 400 }));
  return out;
}

function renderAirMaskingCheck(m) {
  const out = [];
  out.push(h3('Q4-2　気導：交差聴取が起こりうるかを判定してください。', { keepNext: true }));
  out.push(box([formula('airCrossCheck', m)], FILL.info));
  out.push(table([1500, 1980, 1980, 1280, 2280], [
    ['検耳', '検耳の気導閾値', '非検耳の骨導閾値', '差', '判定（要・不要）'],
    ['右（1 kHz）', '', '', '', ''],
    ['左（1 kHz）', '', '', '', ''],
  ], { center: true, blankHeight: 420 }));
  return out;
}

function renderBoneMaskingCalc(m) {
  const earJa = { right: '右', left: '左' };
  const out = [];
  out.push(h3(`Q4-3　骨導：マスキング量を計算してください。（検耳＝${earJa[m.testEar]}、非検耳＝${earJa[m.nonTestEar]}）`, { keepNext: true }));
  out.push(box([formula('boneMin', m), formula('boneMax', m), formula('plateau', m)], FILL.info));

  const cols = m.frequencies.map(freqLabel);
  const labelW = 3400;
  const each = Math.floor((9020 - labelW) / cols.length);
  const widths = [labelW, ...cols.map((_, i) => (i === cols.length - 1 ? 9020 - labelW - each * (cols.length - 1) : each))];
  const blank = cols.map(() => '');
  out.push(table(widths, [
    ['項目', ...cols],
    [`非検耳（${earJa[m.nonTestEar]}）の気導閾値`, ...blank],
    [`検耳（${earJa[m.testEar]}）の骨導閾値`, ...blank],
    ['①　最小有効マスキング量', ...blank],
    ['②　最大マスキング量', ...blank],
    ['③　プラトー幅', ...blank],
    ['④　プラトーは取れるか（○／×）', ...blank],
  ], { blankHeight: 400 }));
  return out;
}

export function renderStudent(c) {
  const m = c.masking;
  const F = [];

  F.push(h1(c.title));
  F.push(p([run(c.subtitle, { size: 20, color: '555555' })], { after: 160 }));
  F.push(table([1600, 7420], [
    ['項目', '内容'],
    ['対象', c.target],
    ['所要時間', c.duration],
    ['使用検査', c.examinations],
    ['ねらい', c.objective],
  ]));

  F.push(spacer(160));
  F.push(table([1300, 3200, 1300, 3220], [['学籍番号', '', '氏名', '']], { header: false, blankHeight: 460 }));

  F.push(h2('実施ルール'));
  c.studentRules.forEach((r, i) => F.push(p(`${i + 1}.　${r}`)));

  F.push(h2('本課題で用いるマスキングの前提'));
  F.push(box([
    `両耳間減衰量（IA）：気導 ${m.interauralAttenuationAC} dB（周波数によらず一律）／骨導 ${m.interauralAttenuationBC} dB`,
    `安全域：${m.safetyMargin} dB`,
    m.occlusionCorrection ? '閉鎖効果（OE）の補正を加える' : '閉鎖効果（OE）の補正は本課題では加えない',
  ], FILL.info));

  for (const s of c.stages) {
    F.push(h2(`${s.id}　${s.title}`, { newPage: true }));
    if (s.intro) F.push(p(s.intro));
    if (s.showHistory) F.push(box(c.history, FILL.plain));

    if (s.showTympanometry) {
      F.push(h3('ティンパノメトリー', { keepNext: true }));
      F.push(table([3020, 3000, 3000], [['', '右', '左'], ...c.findings.tympanometry.rows], { center: true }));
      F.push(spacer(60));
    }
    if (s.showAcousticReflex) {
      F.push(h3('アブミ骨筋反射（プローブ側で記載）', { keepNext: true }));
      F.push(table([3020, 3000, 3000], [['刺激', '右プローブ', '左プローブ'], ...c.findings.acousticReflex.rows], { center: true }));
    }
    if (s.showDpoae) {
      const d = c.findings.dpoae;
      F.push(p([run('DP-gram（SNR, dB）', { size: 19, bold: true })], { after: 60 }));
      const w = [1580, ...d.frequencies.map(() => Math.floor((9020 - 1580) / d.frequencies.length))];
      F.push(table(w, [
        ['', ...d.frequencies],
        ['右', ...d.snr.right.map(String)],
        ['左', ...d.snr.left.map(String)],
      ], { center: true }));
      F.push(p([run(`判定基準：SNR ≧ ${d.criterionSNR} dB を反応ありとする（本課題の設定値）`, { size: 18, color: '555555' })], { before: 80 }));
    }
    if (s.showThresholdEntry) F.push(...renderThresholdEntry());
    if (s.showAirMaskingCheck) F.push(...renderAirMaskingCheck(m));
    if (s.showBoneMaskingCalc) F.push(...renderBoneMaskingCalc(m));

    for (const q of s.questions || []) F.push(...renderQuestion(q));
  }

  F.push(h2('提出前チェック'));
  c.submissionChecklist.forEach((t) => F.push(p(`□　${t}`)));

  return buildDoc(F, `${c.title}　学生用`);
}

export function buildDoc(children, headerText) {
  return new Document({
    styles: { default: { document: { run: { font: FONT, size: 20 } } } },
    sections: [{
      properties: { page: { margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } },
      headers: {
        default: new Header({
          children: [new Paragraph({
            children: [new TextRun({ text: headerText, font: FONT, size: 16, color: '777777' })],
            border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'CCCCCC', space: 4 } },
          })],
        }),
      },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ children: [PageNumber.CURRENT, ' / ', PageNumber.TOTAL_PAGES], font: FONT, size: 16, color: '777777' })],
          })],
        }),
      },
      children,
    }],
  });
}
