const fs = require('fs');
const path = require('path');
const PptxGenJS = require('pptxgenjs');

// Markdownファイルを読み込む
const markdownContent = fs.readFileSync(
  path.join(__dirname, 'HearSim_特許提案資料.md'),
  'utf-8'
);

// スライドデータを解析
const slides = [];
const slideContents = markdownContent.split('---\n').filter(section => section.trim());

slideContents.forEach((section, index) => {
  const lines = section.split('\n').filter(line => line.trim());
  if (lines.length === 0) return;
  
  const titleMatch = section.match(/## スライド\d+: (.+)/);
  const title = titleMatch ? titleMatch[1] : `スライド ${index + 1}`;
  
  // マークダウンをテキストに変換（簡易版）
  let content = section
    .replace(/##+ /g, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/スライド\d+:/g, '')
    .trim();
  
  slides.push({ title, content });
});

// PowerPointプレゼンテーションを作成
const pptx = new PptxGenJS();

// スライドを追加
slides.forEach((slide, index) => {
  const slideObj = pptx.addSlide();
  
  // 背景色を設定
  slideObj.background = { color: 'FFFFFF' };
  
  // タイトルを追加
  if (slide.title) {
    slideObj.addText(slide.title, {
      x: 0.5,
      y: 0.5,
      w: 9,
      h: 0.8,
      fontSize: 32,
      bold: true,
      color: '667eea',
      align: 'left',
    });
  }
  
  // コンテンツを追加（簡易版）
  const lines = slide.content.split('\n').filter(line => line.trim() && !line.startsWith('#'));
  let yPos = 1.8;
  
  lines.forEach(line => {
    if (line.trim() && yPos < 6.5) {
      const fontSize = line.match(/^###/) ? 20 : line.match(/^##/) ? 24 : 16;
      slideObj.addText(line.replace(/^#+\s*/, ''), {
        x: 0.5,
        y: yPos,
        w: 9,
        h: 0.5,
        fontSize: fontSize,
        color: '333333',
        align: 'left',
      });
      yPos += 0.6;
    }
  });
  
  // スライド番号を追加
  slideObj.addText(`${index + 1}`, {
    x: 9.5,
    y: 6.8,
    w: 0.5,
    h: 0.3,
    fontSize: 12,
    color: '999999',
    align: 'right',
  });
});

// ファイルを保存
const outputPath = path.join(__dirname, 'HearSim_特許提案資料.pptx');
pptx.writeFile(outputPath)
  .then(() => {
    console.log(`✅ PowerPointファイルを作成しました: ${outputPath}`);
  })
  .catch(err => {
    console.error('❌ エラーが発生しました:', err);
  });






