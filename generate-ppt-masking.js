const fs = require('fs');
const path = require('path');
const PptxGenJS = require('pptxgenjs');

// 読み込むMarkdownファイル
const markdownPath = path.join(__dirname, 'HearSim_マスキング訓練プレゼン.md');
const markdownContent = fs.readFileSync(markdownPath, 'utf-8');

// スライドごとに分割
const sections = markdownContent.split('---\n').map(section => section.trim()).filter(Boolean);

const slides = sections.map((section, index) => {
  const lines = section.split('\n').filter(line => line.trim());
  if (lines.length === 0) {
    return null;
  }

  const titleMatch = section.match(/## スライド\d+: (.+)/);
  const title = titleMatch ? titleMatch[1].trim() : `スライド ${index + 1}`;

  const content = section
    .replace(/```mermaid([\s\S]*?)```/g, (_match, code) => `MERMAID_BLOCK_START\n${code.trim()}\nMERMAID_BLOCK_END`)
    .replace(/##+ /g, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/スライド\d+: /g, '')
    .trim();

  const hasMermaid = content.includes('MERMAID_BLOCK_START');

  return {
    title,
    content,
    hasMermaid,
  };
}).filter(Boolean);

const pptx = new PptxGenJS();

slides.forEach((slide, index) => {
  const slideObj = pptx.addSlide();
  slideObj.background = { color: 'FFFFFF' };

  if (slide.title) {
    slideObj.addText(slide.title, {
      x: 0.5,
      y: 0.5,
      w: 9,
      h: 0.8,
      fontSize: 32,
      bold: true,
      color: '1f2937',
      align: 'left',
    });
  }

  const blocks = slide.content.split('\n').filter(line => line.trim());
  let yPos = 1.8;

  blocks.forEach(block => {
    if (block === 'MERMAID_BLOCK_START') {
      return;
    }
    if (block === 'MERMAID_BLOCK_END') {
      slideObj.addText('Mermaid 図は資料参照', {
        x: 0.8,
        y: yPos,
        w: 8,
        h: 0.6,
        fontSize: 16,
        color: '2563eb',
        italic: true,
      });
      yPos += 0.8;
      return;
    }

    if (yPos > 6.8) {
      return;
    }

    const isHeading3 = block.startsWith('### ');
    const isHeading2 = block.startsWith('## ');
    const cleanText = block.replace(/^#+\s*/, '');
    const fontSize = isHeading3 ? 20 : isHeading2 ? 24 : 16;

    slideObj.addText(cleanText, {
      x: 0.8,
      y: yPos,
      w: 8.4,
      h: 0.5,
      fontSize,
      color: '374151',
      bullet: !isHeading2 && !isHeading3 && block.startsWith('- '),
      bulletIndent: 0.3,
      bulletMargin: 0.2,
      align: 'left',
    });
    yPos += isHeading2 ? 0.7 : 0.5;
  });

  slideObj.addText(`${index + 1}`, {
    x: 9.6,
    y: 6.8,
    w: 0.4,
    h: 0.3,
    fontSize: 12,
    color: '94a3b8',
    align: 'right',
  });
});

const outputPath = path.join(__dirname, 'HearSim_マスキング訓練プレゼン.pptx');

pptx.writeFile(outputPath)
  .then(() => {
    console.log(`✅ PowerPointファイルを作成しました: ${outputPath}`);
  })
  .catch(err => {
    console.error('❌ エラーが発生しました:', err);
  });




