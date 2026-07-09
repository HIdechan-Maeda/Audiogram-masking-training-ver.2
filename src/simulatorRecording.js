export const PIP_HEADER_PX = 28;

export function getPreferredRecorderMimeType() {
  const candidates = [
    'video/webm;codecs=vp8',
    'video/webm;codecs=vp9',
    'video/webm',
    'video/mp4',
  ];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) || 'video/webm';
}

export function canPlayRecordingMimeType(mimeType) {
  if (typeof document === 'undefined') return true;
  const video = document.createElement('video');
  return mimeType ? video.canPlayType(mimeType) !== '' : false;
}

export async function requestCameraStream() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('このブラウザはカメラ API に対応していません。');
  }
  return navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: 'user',
      width: { ideal: 1920 },
      height: { ideal: 1080 },
    },
    audio: false,
  });
}

export function stopMediaStream(stream) {
  stream?.getTracks().forEach((track) => track.stop());
}

export function waitForVideoFrame(video, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    if (!video) {
      reject(new Error('カメラ映像要素が見つかりません。'));
      return;
    }
    const ready = () => video.videoWidth > 0 && video.videoHeight > 0 && video.readyState >= 2;
    if (ready()) {
      resolve();
      return;
    }
    const timer = setTimeout(
      () => reject(new Error('カメラ映像の準備がタイムアウトしました。')),
      timeoutMs
    );
    const done = () => {
      if (!ready()) return;
      clearTimeout(timer);
      video.removeEventListener('loadeddata', done);
      video.removeEventListener('playing', done);
      resolve();
    };
    video.addEventListener('loadeddata', done);
    video.addEventListener('playing', done);
    video.play().catch(() => {});
  });
}

export async function attachCameraToVideo(stream, video) {
  if (!video) return;
  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  video.setAttribute('playsinline', '');
  video.setAttribute('webkit-playsinline', '');
  await video.play();
  await waitForVideoFrame(video);
}

export function detachCameraFromVideo(video) {
  if (video) video.srcObject = null;
}

export function downloadRecordingBlob(blob, filenamePrefix = 'eye-movement') {
  const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${filenamePrefix}-${new Date().toISOString().replace(/[:.]/g, '-')}.${ext}`;
  anchor.click();
  URL.revokeObjectURL(url);
}

/** カメラ映像のみを録画（シミュレータ画面は含めない） */
export function startCameraRecording(stream) {
  if (!stream?.getVideoTracks().length) {
    throw new Error('カメラストリームがありません。');
  }
  const mimeType = getPreferredRecorderMimeType();
  if (!MediaRecorder.isTypeSupported(mimeType)) {
    throw new Error('このブラウザは動画録画（MediaRecorder）に対応していません。');
  }

  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 5_000_000,
  });
  const chunks = [];

  recorder.ondataavailable = (event) => {
    if (event.data?.size > 0) chunks.push(event.data);
  };

  recorder.start(500);

  return {
    mimeType,
    stop: () =>
      new Promise((resolve) => {
        recorder.onstop = () => {
          resolve(new Blob(chunks, { type: mimeType }));
        };
        if (recorder.state === 'recording') {
          try {
            recorder.requestData();
          } catch (e) {
            /* ignore */
          }
          window.setTimeout(() => {
            if (recorder.state === 'recording') recorder.stop();
          }, 120);
        } else {
          resolve(null);
        }
      }),
  };
}
