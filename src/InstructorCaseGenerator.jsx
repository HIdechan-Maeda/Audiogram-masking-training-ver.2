import React, { forwardRef, useMemo, useRef, useState } from 'react';
import { generateAudiogram, EngineConstants } from './engine/generateAudiogram';

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
  const [pngBusy, setPngBusy] = useState(false);
  const audiogramSvgRef = useRef(null);

  const needsSide = UNILATERAL.has(profile);

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

  const generate = () => {
    const opts = { ageGroup, sex, profile, severity: Number(severity) };
    if (needsSide && affectedSide !== 'auto') opts.affectedSide = affectedSide;
    if (seedInput !== '' && Number.isFinite(Number(seedInput))) opts.seed = Number(seedInput);
    const data = generateAudiogram(opts);
    setCaseData(data);
    setSeedInput(String(data.meta.seed));
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
          学習者画面には出さない条件指定です。授業デモ・内容確認用。いまはオージオグラムのみ。TYM／ART／DPOAE は同じ症例につなぐ予定です。
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

      <div className="flex flex-wrap gap-2 mb-6">
        <button
          type="button"
          onClick={generate}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
        >
          オージオグラムを生成
        </button>
        <button
          type="button"
          onClick={() => { setSeedInput(''); setCaseData(null); }}
          className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm"
        >
          クリア
        </button>
      </div>

      {caseData && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {metaBits.map((b) => (
              <span key={b} className="text-xs px-2 py-1 rounded-full bg-blue-50 text-blue-800 border border-blue-100">{b}</span>
            ))}
          </div>
          <p className="text-xs text-gray-500">記号は測定画面と同じ（右＝赤・左＝青）。学習者の正答照合は緑です。</p>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={downloadPng}
              disabled={pngBusy}
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 text-sm"
            >
              {pngBusy ? 'PNG保存中…' : 'PNGで保存'}
            </button>
            <span className="text-xs text-gray-400">プレビューと同じ記号・縦横比で出力します</span>
          </div>
          <AudiogramPreview ref={audiogramSvgRef} right={caseData.right} left={caseData.left} />
          <ThresholdTable right={caseData.right} left={caseData.left} />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
            {['ティンパノメトリー', 'ART', 'DPOAE'].map((name) => (
              <div key={name} className="border border-dashed border-gray-300 rounded-xl p-4 text-gray-400">
                {name}（未接続）
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
