import { DPOAE_F2_KHZ } from './dpoaeConstants.js';
/**
 * EDU 講師画面で作った症例 → 臨床推論課題（teaching/cases）向けの書き出し。
 * ブラウザ／Node 両方可（Node 専用 API は使わない）。
 */

const FREQ_LABEL_TO_HZ = {
  '0.125kHz': 125,
  '0.25kHz': 250,
  '0.5kHz': 500,
  '1kHz': 1000,
  '2kHz': 2000,
  '4kHz': 4000,
  '8kHz': 8000,
};

const AC_FREQS = [125, 250, 500, 1000, 2000, 4000, 8000];
const BC_FREQS = [250, 500, 1000, 2000, 4000];

const PROFILE_DIAGNOSIS = {
  Normal: '正常聴力',
  SNHL_Age: '加齢性感音難聴',
  SNHL_NoiseNotch: '騒音性難聴',
  SNHL_Meniere: 'メニエール病',
  SNHL_Sudden: '突発性難聴',
  SNHL_Mumps: 'ムンプス難聴',
  CHL_OME: '滲出性中耳炎',
  CHL_AOM: '急性中耳炎',
  CHL_Otosclerosis: '耳硬化症',
  CHL_OssicularDiscontinuity: '耳小骨連鎖離断',
};

function earMap(rows, key, freqs) {
  const byHz = {};
  for (const r of rows || []) {
    const hz = FREQ_LABEL_TO_HZ[r.freq];
    if (hz == null) continue;
    if (typeof r[key] === 'number') byHz[hz] = r[key];
  }
  const out = {};
  for (const f of freqs) {
    if (typeof byHz[f] === 'number') out[String(f)] = byHz[f];
  }
  return out;
}

/** generateAudiogram 結果 → representativeThresholds.ac/bc */
export function audiogramToRepresentativeThresholds(caseData) {
  return {
    ac: {
      right: earMap(caseData.right, 'ac', AC_FREQS),
      left: earMap(caseData.left, 'ac', AC_FREQS),
    },
    bc: {
      right: earMap(caseData.right, 'bc', BC_FREQS),
      left: earMap(caseData.left, 'bc', BC_FREQS),
    },
  };
}

function artCell(summarySide, which) {
  if (!summarySide) return '—';
  const v = which === 'ipsi' ? summarySide.ipsi : summarySide.cont;
  if (!v || v === '正常帯') return '反応あり';
  if (v === '消失' || v === '一部消失') return '消失';
  if (String(v).includes('閾値')) return '閾値上昇';
  return String(v);
}

function tymTypeLabel(type) {
  if (!type || type === '—') return '—';
  return `${type}型`;
}

function tymPeakLabel(ear, type) {
  if (!ear) return '—';
  if (type === 'B') return '同定不能';
  if (typeof ear.peakPressure === 'number') return `${ear.peakPressure} daPa`;
  return '—';
}

function tymComplianceLabel(ear, type) {
  if (!ear) return '—';
  if (type === 'B') return '同定不能';
  if (typeof ear.peakCompliance === 'number') return `${ear.peakCompliance} mL`;
  return '—';
}

/** companion bundle → findings（シートに載せる他覚的検査） */
export function companionToFindings(companion) {
  const tym = companion?.summary?.tym;
  const art = companion?.summary?.art;
  const dpoae = companion?.dpoaeData;
  const dpoaeCfg = companion?.dpoaeConfig;

  const rightType = tym?.rightType || tym?.overall || '—';
  const leftType = tym?.leftType || tym?.overall || '—';

  const findings = {
    tympanometry: {
      rows: [
        ['型', tymTypeLabel(rightType), tymTypeLabel(leftType)],
        ['ピーク圧', tymPeakLabel(tym?.right, rightType), tymPeakLabel(tym?.left, leftType)],
        ['静的コンプライアンス', tymComplianceLabel(tym?.right, rightType), tymComplianceLabel(tym?.left, leftType)],
        ['外耳道容積', '正常範囲', '正常範囲'],
      ],
    },
    acousticReflex: {
      rows: [
        ['非交叉', artCell(art?.right, 'ipsi'), artCell(art?.left, 'ipsi')],
        ['交叉', artCell(art?.right, 'cont'), artCell(art?.left, 'cont')],
      ],
    },
  };

  const freqs = dpoaeCfg?.frequencies || [...DPOAE_F2_KHZ];
  const snrOf = (ear) => {
    if (!dpoae?.[ear] || !dpoae.noiseFloor?.[ear]) {
      return freqs.map(() => null);
    }
    return dpoae[ear].map((lvl, i) => {
      const nf = dpoae.noiseFloor[ear][i] ?? 0;
      return Math.round((lvl - nf) * 10) / 10;
    });
  };

  findings.dpoae = {
    criterionSNR: 6,
    frequencies: freqs.map((f) => `${f}k`),
    snr: {
      right: snrOf('right'),
      left: snrOf('left'),
    },
  };

  return findings;
}

/**
 * EDU 症例 → 課題取り込み用エクスポート JSON（部分定義）。
 * stages / teaching 本文は import 時にテンプレートと合成する。
 */
export function buildTeachingCaseExport({
  caseData,
  companion,
  caseId = 'case02',
  level = 1,
  includeTym = true,
  includeArt = true,
  includeDpoae = true,
} = {}) {
  const m = caseData?.meta || {};
  const profile = m.profile || 'Normal';
  const sex = m.sex === 'Male' ? 'male' : 'female';
  let ears = 'both';
  if (m.affectedSide === 'R') ears = 'right';
  if (m.affectedSide === 'L') ears = 'left';

  const thresholds = audiogramToRepresentativeThresholds(caseData);
  const findings = companionToFindings(companion);

  if (!includeTym) delete findings.tympanometry;
  if (!includeArt) delete findings.acousticReflex;
  if (!includeDpoae) delete findings.dpoae;

  const diagnosis = PROFILE_DIAGNOSIS[profile] || profile;
  const id = /^case\d{2}$/.test(caseId) ? caseId : 'case02';

  return {
    exportVersion: 1,
    exportedAt: new Date().toISOString(),
    source: 'AudioScope EDU instructor',
    id,
    level,
    title: `臨床推論課題　症例${id.replace('case', '')}`,
    subtitle: 'AudioScope EDU 連動課題',
    diagnosis,
    target: '言語聴覚療法学科・聴覚検査領域',
    duration: '20〜25分（照合・振り返りを含む）',
    examinations: 'ティンパノメトリー・アブミ骨筋反射検査・DPOAE・純音聴力検査',
    objective: '4検査の結果を相互に突き合わせ病巣を推定する／マスキング量を計算できる',
    generation: {
      profile,
      ageGroup: m.ageGroup,
      sex,
      severity: m.severity,
      ears,
      seed: m.seed,
      _comment: 'EDU 講師画面から書き出した生成条件。学生シートと EDU 出力は必ずこの値から派生する。',
    },
    masking: {
      interauralAttenuationAC: 50,
      interauralAttenuationBC: 0,
      safetyMargin: 10,
      occlusionCorrection: false,
      frequencies: [500, 1000, 2000],
      testEar: ears === 'left' ? 'left' : 'right',
      nonTestEar: ears === 'left' ? 'right' : 'left',
    },
    representativeThresholds: {
      _comment: 'EDU 生成器の出力から取り込み。seed を変えたら sync-thresholds を再実行すること。',
      source: 'generator',
      generatedAt: new Date().toISOString(),
      generatorOpts: {
        profile,
        ageGroup: m.ageGroup,
        sex: m.sex,
        severity: m.severity,
        seed: m.seed,
        ...(m.affectedSide ? { affectedSide: m.affectedSide } : {}),
      },
      ...thresholds,
    },
    history: [
      `（EDU書き出し）${m.ageGroup || ''}・${sex === 'male' ? '男性' : '女性'}。診断の目安: ${diagnosis}。病歴文は教員が編集してください。`,
    ],
    findings,
    _eduMeta: {
      includeTym,
      includeArt,
      includeDpoae,
      companionSummary: companion?.summary || null,
    },
  };
}

export function downloadJsonFile(obj, filename) {
  const blob = new Blob([`${JSON.stringify(obj, null, 2)}\n`], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
