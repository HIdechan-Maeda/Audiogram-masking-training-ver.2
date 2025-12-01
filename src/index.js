import React from 'react';
import ReactDOM from 'react-dom/client';
import AudiogramMaskingMVP from './AudiogramMaskingMVP';
import InstructorApp from './InstructorApp';
import HearingAidSimulator from './HearingAidSimulator';

// URLパラメータで講師用ダッシュボードや補聴器シミュレーターにアクセス
const urlParams = new URLSearchParams(window.location.search);
const mode = urlParams.get('mode');

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    {mode === 'instructor' ? <InstructorApp /> : 
     mode === 'hearing-aid' ? <HearingAidSimulator /> : 
     <AudiogramMaskingMVP />}
  </React.StrictMode>
);