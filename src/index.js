import React from 'react';
import ReactDOM from 'react-dom/client';
import AudiogramMaskingMVP from './AudiogramMaskingMVP';
import TympanogramViewer from './TympanogramViewer';

// URLパラメータで表示するコンポーネントを切り替え
const urlParams = new URLSearchParams(window.location.search);
const view = urlParams.get('view');

const root = ReactDOM.createRoot(document.getElementById('root'));

if (view === 'tympanogram') {
  root.render(
    <React.StrictMode>
      <TympanogramViewer />
    </React.StrictMode>
  );
} else {
  root.render(
    <React.StrictMode>
      <AudiogramMaskingMVP />
    </React.StrictMode>
  );
}