/**
 * Instructor ↔ student lesson case sharing via URL query (seed-deterministic).
 * Example: /?lesson=1&ageGroup=40s&sex=Female&profile=CHL_OME&severity=2&seed=123&tym=1&art=1&dpoae=1
 */

import { generateAudiogram } from './generateAudiogram';
import { buildCompanionBundle } from './buildCompanionTests';

const PROFILE_CASE_PATTERN = {
  Normal: 'normal',
  SNHL_Age: 'sensorineural',
  SNHL_NoiseNotch: 'sensorineural',
  SNHL_Meniere: 'sensorineural',
  SNHL_Sudden: 'sensorineural',
  SNHL_Mumps: 'sensorineural',
  CHL_OME: 'conductive',
  CHL_AOM: 'conductive',
  CHL_Otosclerosis: 'conductive',
  CHL_OssicularDiscontinuity: 'conductive',
};

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

/**
 * @typedef {object} LessonCaseSpec
 * @property {string} ageGroup
 * @property {string} sex
 * @property {string} profile
 * @property {number} severity
 * @property {string|null} [affectedSide]
 * @property {number} seed
 * @property {boolean} includeTym
 * @property {boolean} includeArt
 * @property {boolean} includeDpoae
 */

/** @returns {LessonCaseSpec|null} */
export function parseLessonCaseFromSearch(search) {
  const params = new URLSearchParams(
    typeof search === 'string' ? search.replace(/^\?/, '') : String(search || '')
  );
  if (params.get('lesson') !== '1' && params.get('lesson') !== 'true') return null;

  const seed = Number(params.get('seed'));
  const severity = Number(params.get('severity'));
  const ageGroup = params.get('ageGroup');
  const sex = params.get('sex');
  const profile = params.get('profile');
  if (!Number.isFinite(seed) || !ageGroup || !sex || !profile) return null;

  const side = params.get('affectedSide');
  return {
    ageGroup,
    sex,
    profile,
    severity: Number.isFinite(severity) ? severity : 2,
    affectedSide: side === 'R' || side === 'L' ? side : null,
    seed,
    includeTym: params.get('tym') !== '0',
    includeArt: params.get('art') !== '0',
    includeDpoae: params.get('dpoae') !== '0',
  };
}

/** Build student-facing share URL (relative query on current origin). */
export function buildLessonCaseSearch(spec) {
  const params = new URLSearchParams();
  params.set('lesson', '1');
  params.set('ageGroup', spec.ageGroup);
  params.set('sex', spec.sex);
  params.set('profile', spec.profile);
  params.set('severity', String(spec.severity));
  params.set('seed', String(spec.seed));
  if (spec.affectedSide === 'R' || spec.affectedSide === 'L') {
    params.set('affectedSide', spec.affectedSide);
  }
  params.set('tym', spec.includeTym === false ? '0' : '1');
  params.set('art', spec.includeArt === false ? '0' : '1');
  params.set('dpoae', spec.includeDpoae === false ? '0' : '1');
  return `?${params.toString()}`;
}

export function buildLessonCaseUrl(spec, origin = (typeof window !== 'undefined' ? window.location.origin : '')) {
  return `${origin}/${buildLessonCaseSearch(spec)}`;
}

/**
 * Deterministically materialize audiogram + companion tests from a lesson spec.
 * @param {LessonCaseSpec} spec
 * @param {{ caseId?: string }} [opts]
 */
export function materializeLessonCase(spec, options = {}) {
  const genOpts = {
    ageGroup: spec.ageGroup,
    sex: spec.sex,
    profile: spec.profile,
    severity: Number(spec.severity),
    seed: Number(spec.seed),
  };
  if (spec.affectedSide === 'R' || spec.affectedSide === 'L') {
    genOpts.affectedSide = spec.affectedSide;
  }

  const audiogram = generateAudiogram(genOpts);
  const companion = buildCompanionBundle(audiogram, {
    includeTym: spec.includeTym !== false,
    includeArt: spec.includeArt !== false,
    includeDpoae: spec.includeDpoae !== false,
    disorderName: spec.profile,
  });

  const meta = audiogram.meta || {};
  const profileName = meta.profile || spec.profile;
  const casePattern = PROFILE_CASE_PATTERN[profileName] || 'sensorineural';
  const ageLabel = meta.ageGroup || spec.ageGroup;
  const genderLabel = meta.sex === 'Male' ? '男性' : meta.sex === 'Female' ? '女性' : '';

  const caseInfo = {
    caseId: options.caseId || '教材',
    meta,
    casePattern,
    gender: genderLabel,
    age: ageLabel,
    ageGroup: ageLabel,
    disorderType: profileName,
    disorderLabel: PROFILE_LABELS[profileName] || profileName,
    rightProfile: meta.rightProfile,
    leftProfile: meta.leftProfile,
    chiefComplaint: '（教材症例）講師指定の症例です',
    history: `seed=${meta.seed} / ${PROFILE_LABELS[profileName] || profileName} / 程度${meta.severity}`,
    otoscopy: '教材用症例のため省略',
    explanation: '講師が登録した教材症例です。オージオグラムと併用検査は同一 seed から導出されています。',
    tympanogram: companion.tympanogram,
    artConfig: companion.artConfig,
    dpoaeConfig: companion.dpoaeConfig,
    dpoaeData: companion.dpoaeData,
    lessonSpec: spec,
    isLessonCase: true,
  };

  return {
    audiogram,
    companion,
    targets: companion.targets,
    caseInfo,
  };
}

export function lessonSpecFromGenerated(caseData, companionOpts = {}) {
  const m = caseData?.meta || {};
  return {
    ageGroup: m.ageGroup,
    sex: m.sex,
    profile: m.profile,
    severity: m.severity,
    affectedSide: m.affectedSide || null,
    seed: m.seed,
    includeTym: companionOpts.includeTym !== false,
    includeArt: companionOpts.includeArt !== false,
    includeDpoae: companionOpts.includeDpoae !== false,
  };
}
