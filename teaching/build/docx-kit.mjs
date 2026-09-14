/**
 * docx 生成の共通部品。レイアウトだけを持ち、症例の内容は持たない。
 * 症例の内容は cases/*.json 側にある。
 *
 * 注意（docx-js の落とし穴）:
 *  - 同じ罫線設定の段落を連続させると Word/LibreOffice が 1 つの枠として結合し、
 *    罫線が 1 本しか描かれない。記入用の罫線は lines() のようにテーブルで作ること。
 *  - 改ページは PageBreak 段落ではなく見出しの pageBreakBefore で行う。
 *    PageBreak 段落だと直前の要素がページ末に乗ったときに空ページが生まれる。
 */
import {
  Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType,
  BorderStyle, ShadingType, PageBreak, VerticalAlign,
} from 'docx';

const FONT = 'Yu Gothic';
const W = 9020; // content width in DXA for A4 with 1440 margins... A4=11906, margins 1440*2 => 9026
const GREY = 'F2F2F2';
const RULE = 'BFBFBF';

function run(text, opts = {}) {
  return new TextRun({
    text: String(text),
    font: FONT,
    size: opts.size || 20,
    bold: !!opts.bold,
    color: opts.color || '000000',
  });
}

function p(text, opts = {}) {
  return new Paragraph({
    children: Array.isArray(text) ? text : [run(text, opts)],
    spacing: { before: opts.before !== undefined ? opts.before : 60, after: opts.after !== undefined ? opts.after : 60, line: opts.line || 276 },
    alignment: opts.align,
    indent: opts.indent,
    border: opts.border,
  });
}

function h1(text) {
  return new Paragraph({
    children: [run(text, { size: 30, bold: true })],
    spacing: { before: 0, after: 120 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: '333333', space: 6 } },
  });
}

function h2(text, opts = {}) {
  return new Paragraph({
    children: [run(text, { size: 24, bold: true })],
    spacing: { before: opts.newPage ? 0 : 320, after: 120 },
    pageBreakBefore: !!opts.newPage,
    keepNext: true,
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: RULE, space: 4 } },
  });
}

function h3(text, opts = {}) {
  return new Paragraph({
    children: [run(text, { size: 21, bold: true })],
    spacing: { before: opts.newPage ? 0 : 220, after: 80 },
    pageBreakBefore: !!opts.newPage,
    keepNext: opts.keepNext !== false,
    keepLines: true,
  });
}

// quoted / boxed block (病歴など)
function box(lines, shade) {
  return new Table({
    width: { size: W, type: WidthType.DXA },
    columnWidths: [W],
    rows: [new TableRow({
      children: [new TableCell({
        width: { size: W, type: WidthType.DXA },
        shading: { type: ShadingType.CLEAR, fill: shade || GREY },
        margins: { top: 160, bottom: 160, left: 200, right: 200 },
        children: lines.map(l => p(l, { size: 20, before: 20, after: 20 })),
      })],
    })],
  });
}

// ruled writing lines (table-based: adjacent paragraphs with identical
// borders get merged into one box by Word/LibreOffice, so a table is used)
const NO = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const RL = { style: BorderStyle.SINGLE, size: 4, color: RULE };

function lines(n, opts = {}) {
  const h = opts.height || 460;
  const rows = [];
  for (let i = 0; i < n; i++) {
    rows.push(new TableRow({
      height: { value: h, rule: 'atLeast' },
      children: [new TableCell({
        width: { size: W, type: WidthType.DXA },
        borders: { top: NO, left: NO, right: NO, bottom: RL },
        margins: { top: 0, bottom: 0, left: 0, right: 0 },
        children: [new Paragraph({ children: [run('')], spacing: { before: 0, after: 0 } })],
      })],
    }));
  }
  return [
    new Table({
      width: { size: W, type: WidthType.DXA },
      columnWidths: [W],
      borders: { top: NO, left: NO, right: NO, bottom: RL, insideHorizontal: RL, insideVertical: NO },
      rows,
    }),
  ];
}

function cell(text, opts = {}) {
  const width = opts.width;
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    shading: opts.fill ? { type: ShadingType.CLEAR, fill: opts.fill } : undefined,
    margins: { top: 70, bottom: 70, left: 100, right: 100 },
    verticalAlign: VerticalAlign.CENTER,
    columnSpan: opts.span,
    children: (Array.isArray(text) ? text : [text]).map(t =>
      p(t, { size: opts.size || 19, bold: opts.bold, align: opts.align, before: 10, after: 10, line: 240 })),
  });
}

// rows: array of arrays of strings; widths: array summing to W
function table(widths, rows, opts = {}) {
  const headerRows = opts.header === false ? 0 : 1;
  const blankH = opts.blankHeight; // twips min height for body rows
  return new Table({
    width: { size: widths.reduce((a, b) => a + b, 0), type: WidthType.DXA },
    columnWidths: widths,
    rows: rows.map((r, ri) => new TableRow({
      height: (ri >= headerRows && blankH) ? { value: blankH, rule: 'atLeast' } : undefined,
      tableHeader: ri < headerRows,
      children: r.map((c, ci) => cell(c, {
        width: widths[ci],
        fill: ri < headerRows ? GREY : undefined,
        bold: ri < headerRows,
        align: (ri < headerRows || opts.center) ? AlignmentType.CENTER : undefined,
        size: opts.size,
      })),
    })),
  });
}

function spacer(h) {
  return new Paragraph({ children: [run('')], spacing: { before: h || 120, after: 0 } });
}

function pageBreak() {
  return new Paragraph({ children: [new PageBreak()] });
}

export { FONT, W, GREY, RULE, run, p, h1, h2, h3, box, lines, table, cell, spacer, pageBreak };
