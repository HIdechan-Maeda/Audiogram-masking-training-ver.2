import React from 'react';
import ReactDOM from 'react-dom/client';
import AudiogramMaskingMVP from './AudiogramMaskingMVP';
import InstructorApp from './InstructorApp';

// URLパラメータで講師用ダッシュボードにアクセス
const urlParams = new URLSearchParams(window.location.search);
const mode = urlParams.get('mode');

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    {mode === 'instructor' ? <InstructorApp /> : <AudiogramMaskingMVP />}
  </React.StrictMode>
);