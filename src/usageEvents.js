import { supabase, isSupabaseDisabled } from './supabaseClient';

export const USAGE_EVENT = {
  LOGIN: 'login',
  DEFAULT_CASE_PROGRESS: 'default_case_progress',
  CLINICAL_CASE_GENERATION: 'clinical_case_generation',
};

/** プリセット症例（講師ダッシュの「完了」はこの8症例のみを指す） */
export const DEFAULT_PRESET_KEYS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

/** 完了リストのうちプリセット A〜H のユニーク件数 */
export function countPresetCompletions(progress, presetKeys = DEFAULT_PRESET_KEYS) {
  const list = progress?.completedCases;
  if (!Array.isArray(list) || list.length === 0) return 0;
  const inPreset = list.filter((c) => presetKeys.includes(c));
  return new Set(inPreset).size;
}

/** caseAccuracy のうちプリセットキーだけで平均精度（臨床・Custom は含めない） */
export function averageAccuracyForPresets(progress, presetKeys = DEFAULT_PRESET_KEYS) {
  const caseAccuracy = progress?.caseAccuracy;
  if (!caseAccuracy || typeof caseAccuracy !== 'object') return 0;
  const vals = presetKeys
    .filter((k) => caseAccuracy[k] != null)
    .map((k) => Number(caseAccuracy[k].accuracy) || 0);
  if (vals.length === 0) return 0;
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
}

/** デフォルト症例（A〜H）のみの進捗スナップショット */
export function buildDefaultPresetProgressSnapshot(progress, presetKeys = DEFAULT_PRESET_KEYS) {
  if (!progress || typeof progress !== 'object') {
    return { completedCases: [], caseAccuracy: {}, totalSessions: 0, lastSessionDate: null };
  }
  const caseAccuracy = {};
  presetKeys.forEach((k) => {
    if (progress.caseAccuracy && progress.caseAccuracy[k]) {
      caseAccuracy[k] = { ...progress.caseAccuracy[k] };
    }
  });
  const completedCases = (progress.completedCases || []).filter((c) => presetKeys.includes(c));
  return {
    completedCases,
    caseAccuracy,
    totalSessions: progress.totalSessions ?? 0,
    lastSessionDate: progress.lastSessionDate ?? null,
  };
}

export function usageEventTypeLabel(type) {
  switch (type) {
    case USAGE_EVENT.LOGIN:
      return 'ログイン';
    case USAGE_EVENT.DEFAULT_CASE_PROGRESS:
      return 'デフォルト症例の進捗';
    case USAGE_EVENT.CLINICAL_CASE_GENERATION:
      return '臨床症例の生成';
    default:
      return type || '—';
  }
}

/**
 * @param {string} studentId
 * @param {string|null|undefined} userId
 * @param {'login'|'default_case_progress'|'clinical_case_generation'} eventType
 * @param {Record<string, unknown>} metadata
 */
export async function logStudentUsageEvent(studentId, userId, eventType, metadata = {}) {
  if (isSupabaseDisabled || !studentId) return;
  try {
    const { error } = await supabase.from('student_usage_events').insert({
      student_id: studentId,
      user_id: userId || null,
      event_type: eventType,
      metadata,
    });
    if (error) {
      if (error.code === '42P01' || error.message?.includes('does not exist')) {
        console.warn('student_usage_events テーブルがありません。SQL student_usage_events.sql を実行してください。');
      } else {
        console.error('使用履歴の記録エラー:', error);
      }
    }
  } catch (e) {
    console.warn('使用履歴の記録に失敗:', e);
  }
}

export async function fetchStudentUsageEvents(studentId, limit = 200) {
  if (isSupabaseDisabled || !studentId) {
    return { data: [], error: null };
  }
  return supabase
    .from('student_usage_events')
    .select('*')
    .eq('student_id', studentId)
    .order('created_at', { ascending: false })
    .limit(limit);
}

export function formatUsageMetadataPreview(row) {
  if (!row?.metadata) return '—';
  const m = row.metadata;
  if (row.event_type === USAGE_EVENT.LOGIN) return 'ログイン';
  if (row.event_type === USAGE_EVENT.CLINICAL_CASE_GENERATION) {
    const parts = [];
    if (m.casePattern) parts.push(String(m.casePattern));
    if (m.disorderLabel) parts.push(String(m.disorderLabel));
    if (m.ageGroup) parts.push(String(m.ageGroup));
    if (m.affectedSide) parts.push(`患側 ${m.affectedSide}`);
    if (m.rightProfile && m.leftProfile && m.rightProfile !== m.leftProfile) {
      parts.push(`R:${m.rightProfile} / L:${m.leftProfile}`);
    }
    return parts.join(' · ') || '臨床自動生成';
  }
  if (row.event_type === USAGE_EVENT.DEFAULT_CASE_PROGRESS && m.snapshot) {
    const s = m.snapshot;
    const done = (s.completedCases && s.completedCases.length) || 0;
    return `プリセット完了 ${done}/8 · セッション ${s.totalSessions ?? 0}`;
  }
  return '—';
}

export async function fetchAllUsageEvents(limit = 2000) {
  if (isSupabaseDisabled) {
    return { data: [], error: null };
  }
  return supabase
    .from('student_usage_events')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
}
