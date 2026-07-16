import React, { useEffect, useRef, useState } from 'react';
import { canPlayRecordingMimeType } from './simulatorRecording';

export default function RecordingPreviewModal({ previewUrl, mimeType, onClose, onDownload }) {
  const videoRef = useRef(null);
  const [playError, setPlayError] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const playable = canPlayRecordingMimeType(mimeType);

  useEffect(() => {
    setPlayError(false);
    setIsPlaying(false);
    const video = videoRef.current;
    if (!video || !previewUrl) return;
    video.pause();
    video.currentTime = 0;
    video.load();
    // 自動再生しない（ユーザーが再生ボタンを押すまで待機）
  }, [previewUrl]);

  const handlePlay = async () => {
    const video = videoRef.current;
    if (!video) return;
    try {
      await video.play();
      setIsPlaying(true);
      setPlayError(false);
    } catch {
      setPlayError(true);
    }
  };

  const handlePause = () => {
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    setIsPlaying(false);
  };

  if (!previewUrl) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 md:p-6 bg-black/80">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[96vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">カメラ録画プレビュー</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              カメラ映像のみ（シミュレータ画面は含みません）。自動再生はしません。
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-500 hover:text-gray-800 text-2xl leading-none px-2"
            aria-label="閉じる"
          >
            ×
          </button>
        </div>
        <div className="flex-1 min-h-0 bg-black flex flex-col items-center justify-center p-2 md:p-4 gap-3 relative">
          {(!playable || playError) && (
            <p className="text-sm text-amber-200 bg-amber-900/50 rounded-lg px-3 py-2 max-w-lg text-center">
              このブラウザではプレビュー再生に対応していない可能性があります（Safari 等）。
              「動画をダウンロード」して VLC や Chrome で開いて確認してください。
            </p>
          )}
          <div className="relative w-full flex items-center justify-center">
            <video
              ref={videoRef}
              src={previewUrl}
              controls
              playsInline
              preload="metadata"
              className="w-full max-h-[78vh] object-contain bg-black"
              onError={() => setPlayError(true)}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onEnded={() => setIsPlaying(false)}
            >
              {mimeType ? <source src={previewUrl} type={mimeType} /> : null}
            </video>
            {!isPlaying && playable && !playError && (
              <button
                type="button"
                onClick={handlePlay}
                className="absolute inset-0 m-auto w-20 h-20 rounded-full bg-indigo-600/90 hover:bg-indigo-500 text-white shadow-xl flex items-center justify-center"
                aria-label="録画を再生"
                title="再生"
              >
                <span className="ml-1 text-3xl leading-none">▶</span>
              </button>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 justify-end px-4 py-3 border-t border-gray-200 bg-gray-50">
          {!isPlaying ? (
            <button
              type="button"
              onClick={handlePlay}
              disabled={!playable}
              className="px-4 py-2 text-sm rounded-lg bg-teal-600 text-white hover:bg-teal-700 font-medium disabled:opacity-40"
            >
              再生
            </button>
          ) : (
            <button
              type="button"
              onClick={handlePause}
              className="px-4 py-2 text-sm rounded-lg bg-slate-600 text-white hover:bg-slate-700 font-medium"
            >
              一時停止
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg border border-gray-300 bg-white hover:bg-gray-50"
          >
            閉じる
          </button>
          <button
            type="button"
            onClick={onDownload}
            className="px-4 py-2 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 font-medium"
          >
            動画をダウンロード
          </button>
        </div>
      </div>
    </div>
  );
}
