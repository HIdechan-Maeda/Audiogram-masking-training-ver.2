import React, { forwardRef, useMemo, useRef, useState } from 'react';
import { generateAudiogram, EngineConstants } from './engine/generateAudiogram';
import { buildCompanionBundle } from './engine/buildCompanionTests';
import { buildLessonCaseUrl, lessonSpecFromGenerated } from './engine/lessonCaseShare';
import { publishLessonPreset, listLessonPresets, deleteLessonPreset } from './engine/lessonPresetStore';
import TympanogramGif from './TympanogramGif';
import StapedialReflexGif from './StapedialReflexGif';
import DPOAE from './DPOAE';

const PROFILE_LABELS = {
  Normal: '正常',
  SNHL_Age: '加齢性感音難聴',
  SNHL_NoiseNotch: '騒音性難聴',
  SNHL_Meniere: 'メニエール病',
  SNHL_Sudden: '突発性難聴',
  SNHL_Mumps: 'ムンプス難聴',
  CHL_OME: '滲出性中耳炎',
  CHL_AOM: '急性中耳炎',
  CHL_Otosclerosis: '耳硬化症',
  CHL_OssicularDiscontinuity: '耳小骨連鎖完全離断',
};

const AGE_LABELS = {
  '20s': '20歳代',
  '30s': '30歳代',
  '40s': '40歳代',
  '50s': '50歳代',
  '60s': '60歳代',
  '70s': '70歳代',
};

const SEVERITY_LABELS = ['なし', '軽度', '中等度', '重度'];

const UNILATERAL = new Set([
  'SNHL_Sudden',
  'SNHL_Meniere',
  'SNHL_Mumps',
  'CHL_OssicularDiscontinuity',
  'CHL_AOM',
]);

const FREQ_HZ = {
  '0.125kHz': 125,
  '0.25kHz': 250,
  '0.5kHz': 500,
  '1kHz': 1000,
  '2kHz': 2000,
  '4kHz': 4000,
  '8kHz': 8000,
};

const DB_MIN = -10;
const DB_MAX = 120;
const FREQ_MIN_HZ = 125;
const FREQ_MAX_HZ = 8000;
/** 20 dB HL と 1 octave を同じ長さにする */
const CELL = 64;
const MARK_R = 5;

function SoArrow({ x, y, color }) {
  const base = y + MARK_R + 2;
  return (
    <g stroke={color} fill="none" strokeWidth="2">
      <line x1={x} y1={base} x2={x} y2={base + 8} />
      <line x1={x - 4} y1={base + 4} x2={x} y2={base + 8} />
      <line x1={x + 4} y1={base + 4} x2={x} y2={base + 8} />
    </g>
  );
}

function MaskedBcBracket({ x, y, color, ear }) {
  const r = MARK_R;
  if (ear === 'R') {
    return (
      <g stroke={color} fill="none" strokeWidth="2">
        <line x1={x - r} y1={y - r} x2={x - r} y2={y + r} />
        <line x1={x - r} y1={y - r} x2={x - r / 3} y2={y - r} />
        <line x1={x - r} y1={y + r} x2={x - r / 3} y2={y + r} />
      </g>
    );
  }
  return (
    <g stroke={color} fill="none" strokeWidth="2">
      <line x1={x + r} y1={y - r} x2={x + r} y2={y + r} />
      <line x1={x + r} y1={y - r} x2={x + r / 3} y2={y - r} />
      <line x1={x + r} y1={y + r} x2={x + r / 3} y2={y + r} />
    </g>
  );
}

function audiogramSvgDimensions() {
  const octaves = Math.log2(FREQ_MAX_HZ / FREQ_MIN_HZ);
  const dbSpan = DB_MAX - DB_MIN;
  const padL = 52;
  const padR = 20;
  const padT = 16;
  const padB = 44;
  const plotW = octaves * CELL;
  const plotH = (dbSpan / 20) * CELL;
  return { W: padL + plotW + padR, H: padT + plotH + padB, padL, padR, padT, padB, plotW, plotH };
}

async function downloadSvgAsPng(svgEl, filename, scale = 2) {
  const clone = svgEl.cloneNode(true);
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.removeAttribute('class');
  const { W, H } = audiogramSvgDimensions();
  clone.setAttribute('width', String(W));
  clone.setAttribute('height', String(H));

  const svgData = new XMLSerializer().serializeToString(clone);
  const url = URL.createObjectURL(new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' }));

  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = url;
    });

    const canvas = document.createElement('canvas');
    canvas.width = W * scale;
    canvas.height = H * scale;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/png');
    link.download = filename;
    link.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}

function buildAudiogramPngFilename(meta) {
  const date = new Date().toISOString().slice(0, 10);
  const profile = (meta?.profile || 'case').replace(/[^a-zA-Z0-9_-]/g, '');
  return `audiogram_${profile}_seed${meta?.seed ?? 'new'}_${date}.png`;
}

const AudiogramPreview = forwardRef(function AudiogramPreview({ right, left }, ref) {
  const { W, H, padL, padT, plotW, plotH } = audiogramSvgDimensions();

  const freqs = EngineConstants.FREQS;

  const xAt = (freqKey) => padL + Math.log2(FREQ_HZ[freqKey] / FREQ_MIN_HZ) * CELL;
  const yAt = (db) => {
    const v = Math.max(DB_MIN, Math.min(DB_MAX, db));
    return padT + ((v - DB_MIN) / 20) * CELL;
  };

  const gridDb = [];
  for (let d = -10; d <= 120; d += 10) gridDb.push(d);

  const rowMap = (rows) => Object.fromEntries((rows || []).map((r) => [r.freq, r]));
  const R = rowMap(right);
  const L = rowMap(left);

  const acPath = (ear) => {
    const pts = freqs
      .map((f) => {
        const row = ear[f];
        if (!row || typeof row.ac !== 'number' || row.soAC) return null;
        return `${xAt(f)},${yAt(row.ac)}`;
      })
      .filter(Boolean);
    return pts.length ? pts.join(' ') : null;
  };

  return (
    <svg
      ref={ref}
      viewBox={`0 0 ${W} ${H}`}
      className="w-full max-w-xl h-auto bg-white rounded-lg border border-gray-200"
    >
      <rect x={padL} y={padT} width={plotW} height={plotH} fill="#fff" stroke="#9ca3af" />
      {gridDb.map((d) => {
        const isZero = d === 0;
        return (
          <g key={d}>
            <line
              x1={padL}
              y1={yAt(d)}
              x2={padL + plotW}
              y2={yAt(d)}
              stroke={isZero ? '#374151' : '#e5e7eb'}
              strokeWidth={isZero ? 2 : 0.75}
            />
            <text x={padL - 8} y={yAt(d) + 4} textAnchor="end" fontSize="11" fill="#6b7280">{d}</text>
          </g>
        );
      })}
      {freqs.map((f) => (
        <g key={f}>
          <line x1={xAt(f)} y1={padT} x2={xAt(f)} y2={padT + plotH} stroke="#9ca3af" />
          <text x={xAt(f)} y={H - 14} textAnchor="middle" fontSize="11" fill="#6b7280">{FREQ_HZ[f]}</text>
        </g>
      ))}
      <text x={14} y={padT + plotH / 2} fontSize="11" fill="#6b7280" transform={`rotate(-90 14 ${padT + plotH / 2})`}>dB HL</text>
      <text x={padL + plotW / 2} y={H - 2} textAnchor="middle" fontSize="11" fill="#6b7280">Hz</text>

      {acPath(R) && <polyline points={acPath(R)} fill="none" stroke="#dc2626" strokeWidth="1.5" />}
      {acPath(L) && <polyline points={acPath(L)} fill="none" stroke="#2563eb" strokeWidth="1.5" strokeDasharray="4 3" />}

      {freqs.map((f) => {
        const r = R[f];
        const l = L[f];
        const x = xAt(f);
        const nodes = [];
        if (r && typeof r.ac === 'number') {
          const y = yAt(r.ac);
          if (r.soAC) {
            nodes.push(
              <g key={`${f}-rac-so`}>
                <circle cx={x} cy={y} r={MARK_R} fill="none" stroke="#dc2626" strokeWidth="2" />
                <SoArrow x={x} y={y} color="#dc2626" />
              </g>
            );
          } else {
            nodes.push(<circle key={`${f}-rac`} cx={x} cy={y} r={MARK_R} fill="none" stroke="#dc2626" strokeWidth="2" />);
          }
        }
        if (l && typeof l.ac === 'number') {
          const y = yAt(l.ac);
          if (l.soAC) {
            nodes.push(
              <g key={`${f}-lac-so`}>
                <line x1={x - MARK_R} y1={y - MARK_R} x2={x + MARK_R} y2={y + MARK_R} stroke="#2563eb" strokeWidth="2" />
                <line x1={x + MARK_R} y1={y - MARK_R} x2={x - MARK_R} y2={y + MARK_R} stroke="#2563eb" strokeWidth="2" />
                <SoArrow x={x} y={y} color="#2563eb" />
              </g>
            );
          } else {
            nodes.push(
              <g key={`${f}-lac`}>
                <line x1={x - MARK_R} y1={y - MARK_R} x2={x + MARK_R} y2={y + MARK_R} stroke="#2563eb" strokeWidth="2" />
                <line x1={x + MARK_R} y1={y - MARK_R} x2={x - MARK_R} y2={y + MARK_R} stroke="#2563eb" strokeWidth="2" />
              </g>
            );
          }
        }
        if (r && typeof r.bc === 'number' && !['0.125kHz', '8kHz'].includes(f)) {
          const y = yAt(r.bc);
          const bcX = x - 8;
          nodes.push(
            <g key={`${f}-rbc${r.soBC ? '-so' : ''}`}>
              <MaskedBcBracket x={bcX} y={y} color="#dc2626" ear="R" />
              {r.soBC && <SoArrow x={bcX} y={y} color="#dc2626" />}
            </g>
          );
        }
        if (l && typeof l.bc === 'number' && !['0.125kHz', '8kHz'].includes(f)) {
          const y = yAt(l.bc);
          const bcX = x + 8;
          nodes.push(
            <g key={`${f}-lbc${l.soBC ? '-so' : ''}`}>
              <MaskedBcBracket x={bcX} y={y} color="#2563eb" ear="L" />
              {l.soBC && <SoArrow x={bcX} y={y} color="#2563eb" />}
            </g>
          );
        }
        return nodes;
      })}
    </svg>
  );
});

function CompanionPreview({ companion, includeTym, includeArt, includeDpoae, onOpenTym, onOpenArt, onOpenDpoae }) {
  if (!companion) return null;
  const { summary } = companion;
  const cards = [];

  if (includeTym && summary?.tym) {
    const t = summary.tym;
    const fmtEar = (ear, type) => {
      const e = t[ear];
      if (!e) return '—';
      return `${type} / ${e.peakPressure ?? '—'} daPa / ${e.peakCompliance ?? '—'} mL`;
    };
    cards.push(
      <div key="tym" className="border border-blue-200 rounded-xl p-4 bg-white">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="text-sm font-semibold text-gray-800">ティンパノメトリー</div>
          <button
            type="button"
            onClick={onOpenTym}
            disabled={!companion.tympanogram}
            className="px-2 py-1 text-xs rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40"
          >
            表示
          </button>
        </div>
        <p className="text-xs text-gray-500 mb-2">全体型: {t.overall}</p>
        <ul className="text-xs text-gray-700 space-y-1">
          <li>右: {fmtEar('right', t.rightType)}</li>
          <li>左: {fmtEar('left', t.leftType)}</li>
        </ul>
      </div>
    );
  }

  if (includeArt && summary?.art) {
    const a = summary.art;
    cards.push(
      <div key="art" className="border border-purple-200 rounded-xl p-4 bg-white">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="text-sm font-semibold text-gray-800">ART（アブミ骨筋反射）</div>
          <button
            type="button"
            onClick={onOpenArt}
            disabled={!companion.artConfig}
            className="px-2 py-1 text-xs rounded-lg bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-40"
          >
            表示
          </button>
        </div>
        <ul className="text-xs text-gray-700 space-y-1">
          <li>右 IPSI: {a.right.ipsi} / CONT: {a.right.cont}</li>
          <li>左 IPSI: {a.left.ipsi} / CONT: {a.left.cont}</li>
        </ul>
      </div>
    );
  }

  if (includeDpoae && summary?.dpoae) {
    const d = summary.dpoae;
    cards.push(
      <div key="dpoae" className="border border-orange-200 rounded-xl p-4 bg-white">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="text-sm font-semibold text-gray-800">DPOAE</div>
          <button
            type="button"
            onClick={onOpenDpoae}
            disabled={!companion.dpoaeConfig}
            className="px-2 py-1 text-xs rounded-lg bg-orange-600 text-white hover:bg-orange-700 disabled:opacity-40"
          >
            表示
          </button>
        </div>
        <ul className="text-xs text-gray-700 space-y-1">
          <li>右: {d.rightPresent}</li>
          <li>左: {d.leftPresent}</li>
        </ul>
      </div>
    );
  }

  if (!cards.length) {
    return (
      <p className="text-xs text-gray-400">併用検査はオフです。上のチェックを入れて再生成してください。</p>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-500">学生画面と同じ検査 UI で連動結果を確認できます（「表示」）。</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">{cards}</div>
    </div>
  );
}

function ThresholdTable({ right, left }) {
  const freqs = EngineConstants.FREQS;
  const fmt = (row, key) => {
    if (!row) return '—';
    if (key === 'ac' && row.soAC) return 'SO';
    if (key === 'bc' && (row.soBC || row.bc == null)) return row.bc == null ? '—' : 'SO';
    const v = row[key];
    return typeof v === 'number' ? v : '—';
  };
  const R = Object.fromEntries((right || []).map((r) => [r.freq, r]));
  const L = Object.fromEntries((left || []).map((r) => [r.freq, r]));
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-xs border-collapse">
        <thead>
          <tr className="bg-gray-50">
            <th className="border px-2 py-1 text-left">周波数</th>
            {freqs.map((f) => (
              <th key={f} className="border px-2 py-1">{FREQ_HZ[f]}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[
            ['右 AC', R, 'ac'],
            ['右 BC', R, 'bc'],
            ['左 AC', L, 'ac'],
            ['左 BC', L, 'bc'],
          ].map(([label, map, key]) => (
            <tr key={label}>
              <td className="border px-2 py-1 font-medium whitespace-nowrap">{label}</td>
              {freqs.map((f) => (
                <td key={f} className="border px-2 py-1 text-center">{fmt(map[f], key)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function InstructorCaseGenerator() {
  const [ageGroup, setAgeGroup] = useState('40s');
  const [sex, setSex] = useState('Female');
  const [profile, setProfile] = useState('Normal');
  const [severity, setSeverity] = useState(2);
  const [affectedSide, setAffectedSide] = useState('auto');
  const [seedInput, setSeedInput] = useState('');
  const [caseData, setCaseData] = useState(null);
  const [companion, setCompanion] = useState(null);
  const [includeTym, setIncludeTym] = useState(true);
  const [includeArt, setIncludeArt] = useState(true);
  const [includeDpoae, setIncludeDpoae] = useState(true);
  const [pngBusy, setPngBusy] = useState(false);
  const [shareStatus, setShareStatus] = useState('');
  const [publishedList, setPublishedList] = useState(() => listLessonPresets());
  const [showTym, setShowTym] = useState(false);
  const [showArt, setShowArt] = useState(false);
  const [showDpoae, setShowDpoae] = useState(false);
  const audiogramSvgRef = useRef(null);

  const needsSide = UNILATERAL.has(profile);

  const refreshPublished = () => setPublishedList(listLessonPresets());

  const downloadPng = async () => {
    if (!audiogramSvgRef.current || !caseData) return;
    setPngBusy(true);
    try {
      await downloadSvgAsPng(
        audiogramSvgRef.current,
        buildAudiogramPngFilename(caseData.meta),
      );
    } catch (err) {
      console.error('PNG export failed', err);
      window.alert('PNGの保存に失敗しました。');
    } finally {
      setPngBusy(false);
    }
  };

  const publishToStudentPresets = () => {
    if (!caseData) {
      window.alert('先に「症例を生成」してください。');
      return;
    }
    const spec = lessonSpecFromGenerated(caseData, { includeTym, includeArt, includeDpoae });
    const entry = publishLessonPreset(spec);
    refreshPublished();
    setShareStatus(`「${entry.label}」を登録しました`);
    window.alert(`学生プリセットに「${entry.label}」を登録しました。\n学生画面を開く（または再読み込み）と、症例プリセット一覧に出ます。`);
    setTimeout(() => setShareStatus(''), 5000);
  };

  const copyShareLink = async () => {
    if (!caseData) return;
    const spec = lessonSpecFromGenerated(caseData, { includeTym, includeArt, includeDpoae });
    const url = buildLessonCaseUrl(spec);
    try {
      await navigator.clipboard.writeText(url);
      setShareStatus('共有リンクをコピーしました（補助手段）');
    } catch (err) {
      console.error('clipboard failed', err);
      window.prompt('コピーできない場合は手動でコピーしてください', url);
      setShareStatus('リンクを表示しました');
    }
    setTimeout(() => setShareStatus(''), 2500);
  };

  const generate = () => {
    const opts = { ageGroup, sex, profile, severity: Number(severity) };
    if (needsSide && affectedSide !== 'auto') opts.affectedSide = affectedSide;
    if (seedInput !== '' && Number.isFinite(Number(seedInput))) opts.seed = Number(seedInput);
    const data = generateAudiogram(opts);
    const bundle = buildCompanionBundle(data, {
      includeTym,
      includeArt,
      includeDpoae,
      disorderName: profile,
    });
    setCaseData(data);
    setCompanion(bundle);
    setSeedInput(String(data.meta.seed));
    setShareStatus('');
  };

  const metaBits = useMemo(() => {
    if (!caseData) return [];
    const m = caseData.meta;
    const bits = [
      `seed ${m.seed}`,
      AGE_LABELS[m.ageGroup] || m.ageGroup,
      m.sex === 'Male' ? '男性' : '女性',
      PROFILE_LABELS[m.profile] || m.profile,
      `程度: ${SEVERITY_LABELS[m.severity] ?? m.severity}`,
    ];
    if (m.affectedSide) bits.push(`患側: ${m.affectedSide === 'R' ? '右' : '左'}`);
    if (m.carhartApplied) bits.push('Carhart様付与');
    if (m.aomMixedApplied) bits.push('AOM混合型');
    return bits;
  }, [caseData]);

  const selectClass = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white';

  return (
    <div className="bg-white rounded-2xl shadow p-6">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-gray-900">教材生成（試作）</h2>
        <p className="text-sm text-gray-600 mt-1">
          症例を生成して「OK（学生プリセットへ登録）」すると、学生画面のプリセット一覧に「教材1」などが追加されます。
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
        <label className="text-sm text-gray-700">
          年齢群
          <select className={`${selectClass} mt-1`} value={ageGroup} onChange={(e) => setAgeGroup(e.target.value)}>
            {EngineConstants.AGE_GROUPS.map((g) => (
              <option key={g} value={g}>{AGE_LABELS[g]}</option>
            ))}
          </select>
        </label>
        <label className="text-sm text-gray-700">
          性別
          <select className={`${selectClass} mt-1`} value={sex} onChange={(e) => setSex(e.target.value)}>
            <option value="Female">女性</option>
            <option value="Male">男性</option>
          </select>
        </label>
        <label className="text-sm text-gray-700">
          聴力像パターン
          <select className={`${selectClass} mt-1`} value={profile} onChange={(e) => setProfile(e.target.value)}>
            {EngineConstants.PROFILES.map((p) => (
              <option key={p} value={p}>{PROFILE_LABELS[p] || p}</option>
            ))}
          </select>
        </label>
        <label className="text-sm text-gray-700">
          程度
          <select className={`${selectClass} mt-1`} value={severity} onChange={(e) => setSeverity(Number(e.target.value))}>
            {SEVERITY_LABELS.map((lab, i) => (
              <option key={i} value={i}>{lab}（{i}）</option>
            ))}
          </select>
        </label>
        <label className="text-sm text-gray-700">
          患側
          <select
            className={`${selectClass} mt-1`}
            value={affectedSide}
            onChange={(e) => setAffectedSide(e.target.value)}
            disabled={!needsSide}
          >
            <option value="auto">自動</option>
            <option value="R">右</option>
            <option value="L">左</option>
          </select>
          {!needsSide && <span className="block text-xs text-gray-400 mt-1">両側性パターンでは使いません</span>}
        </label>
        <label className="text-sm text-gray-700">
          乱数初期値（seed）
          <input
            className={`${selectClass} mt-1`}
            type="number"
            placeholder="空欄で新規"
            value={seedInput}
            onChange={(e) => setSeedInput(e.target.value)}
          />
        </label>
      </div>

      <fieldset className="mb-4">
        <legend className="text-sm font-medium text-gray-800 mb-2">教材に含める検査</legend>
        <div className="flex flex-wrap gap-4 text-sm text-gray-700">
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" checked={includeTym} onChange={(e) => setIncludeTym(e.target.checked)} />
            ティンパノメトリー
          </label>
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" checked={includeArt} onChange={(e) => setIncludeArt(e.target.checked)} />
            ART
          </label>
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" checked={includeDpoae} onChange={(e) => setIncludeDpoae(e.target.checked)} />
            DPOAE
          </label>
        </div>
        <p className="text-xs text-gray-400 mt-1">オージオグラムを親とし、同じ seed から併用検査を導出します。</p>
      </fieldset>

      <div className="flex flex-wrap gap-2 mb-6">
        <button
          type="button"
          onClick={generate}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
        >
          症例を生成
        </button>
        <button
          type="button"
          onClick={publishToStudentPresets}
          disabled={!caseData}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40 text-sm font-medium"
        >
          OK（学生プリセットへ登録）
        </button>
        <button
          type="button"
          onClick={() => { setSeedInput(''); setCaseData(null); setCompanion(null); }}
          className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm"
        >
          クリア
        </button>
        {shareStatus && <span className="text-sm text-indigo-700 self-center">{shareStatus}</span>}
      </div>

      {publishedList.length > 0 && (
        <div className="border border-indigo-100 rounded-xl p-3 bg-indigo-50 mb-6">
          <div className="text-sm font-medium text-indigo-900 mb-2">登録済み（学生プリセットに表示中）</div>
          <ul className="space-y-1">
            {publishedList.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 text-xs text-indigo-950">
                <span>
                  <strong>{p.label}</strong>
                  <span className="text-indigo-700/80 ml-2">
                    {p.spec?.profile} / sev{p.spec?.severity} / seed {p.spec?.seed}
                  </span>
                </span>
                <button
                  type="button"
                  className="text-red-600 hover:underline"
                  onClick={() => { deleteLessonPreset(p.id); refreshPublished(); }}
                >
                  削除
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {caseData && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {metaBits.map((b) => (
              <span key={b} className="text-xs px-2 py-1 rounded-full bg-blue-50 text-blue-800 border border-blue-100">{b}</span>
            ))}
          </div>
          <p className="text-xs text-gray-500">記号は測定画面と同じ（右＝赤・左＝青）。学習者の正答照合は緑です。</p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={downloadPng}
              disabled={pngBusy}
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 text-sm"
            >
              {pngBusy ? 'PNG保存中…' : 'PNGで保存'}
            </button>
            <button
              type="button"
              onClick={copyShareLink}
              className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-xs"
            >
              リンクコピー（補助）
            </button>
          </div>
          <AudiogramPreview ref={audiogramSvgRef} right={caseData.right} left={caseData.left} />
          <ThresholdTable right={caseData.right} left={caseData.left} />
          <CompanionPreview
            companion={companion}
            includeTym={includeTym}
            includeArt={includeArt}
            includeDpoae={includeDpoae}
            onOpenTym={() => setShowTym(true)}
            onOpenArt={() => setShowArt(true)}
            onOpenDpoae={() => setShowDpoae(true)}
          />
        </div>
      )}

      {showTym && companion?.tympanogram && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-lg p-6 max-w-4xl w-full max-h-[95vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-blue-800">ティンパノグラム（連動確認）</h3>
              <button type="button" onClick={() => setShowTym(false)} className="px-3 py-1.5 rounded-lg bg-gray-200 text-sm">閉じる</button>
            </div>
            <TympanogramGif
              width={800}
              height={600}
              tympanogramData={companion.tympanogram}
              durationMs={5000}
              fps={20}
            />
          </div>
        </div>
      )}

      {showArt && companion?.artConfig && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-lg p-6 max-w-5xl w-full max-h-[95vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-purple-800">ART（連動確認）</h3>
              <button type="button" onClick={() => setShowArt(false)} className="px-3 py-1.5 rounded-lg bg-gray-200 text-sm">閉じる</button>
            </div>
            <StapedialReflexGif
              width={1000}
              height={900}
              durationMs={17000}
              fps={20}
              hearingConfig={companion.artConfig}
            />
          </div>
        </div>
      )}

      {showDpoae && companion?.dpoaeConfig && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-lg p-6 max-w-[95vw] w-full max-h-[95vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-orange-800">DPOAE（連動確認）</h3>
              <button type="button" onClick={() => setShowDpoae(false)} className="px-3 py-1.5 rounded-lg bg-gray-200 text-sm">閉じる</button>
            </div>
            <div style={{ width: '100%', overflowX: 'auto' }}>
              <DPOAE
                width={Math.max(1100, typeof window !== 'undefined' ? window.innerWidth * 0.85 : 1100)}
                height={600}
                dpoaeData={companion.dpoaeData}
                durationMs={10000}
                fps={20}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
