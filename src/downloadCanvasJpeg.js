/** Canvas の描画結果を JPEG として保存する。透過は JPEG にできないので、呼ぶ側で背景を塗っておく。 */
export function downloadCanvasJpeg(canvas, filename, quality = 0.92) {
  const url = canvas.toDataURL('image/jpeg', quality);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
