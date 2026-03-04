import React from 'react';
import ReactDOM from 'react-dom/client';
import AudiogramMaskingMVP from './AudiogramMaskingMVP';
import TympanogramViewer from './TympanogramViewer';
import EpidemiologyViewer from './EpidemiologyViewer';
import InstructorApp from './InstructorApp';

// URLパラメータで表示するコンポーネントを切り替え
const urlParams = new URLSearchParams(window.location.search);
const view = urlParams.get('view');
const mode = urlParams.get('mode');

const root = ReactDOM.createRoot(document.getElementById('root'));

if (view === 'tympanogram') {
  root.render(
    <React.StrictMode>
      <TympanogramViewer />
    </React.StrictMode>
  );
} else if (view === 'epidemiology' || mode === 'epidemiology') {
  root.render(
    <React.StrictMode>
      <EpidemiologyViewer />
    </React.StrictMode>
  );
} else if (mode === 'instructor') {
  root.render(
    <React.StrictMode>
      <InstructorApp />
    </React.StrictMode>
  );
} else {
  root.render(
    <React.StrictMode>
      <AudiogramMaskingMVP />
    </React.StrictMode>
  );
}