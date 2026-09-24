/**
 * Instructor-published lesson presets shown in the student preset dropdown.
 * Storage: localStorage (same origin / same browser). Cross-device → Supabase later.
 *
 * Built-in 症例1〜N (teaching/cases) are always merged into the student list.
 */

import { getBuiltinLessonPresets } from './builtinLessonPresets';

const STORAGE_KEY = 'audioscope_edu_lesson_presets';
const CHANGE_EVENT = 'audioscope-lesson-presets-changed';

function readAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  try {
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  } catch {
    /* ignore */
  }
}

/** Rename legacy 「教材N」 labels so the student dropdown matches worksheet naming. */
function normalizePublishedLabel(entry) {
  if (!entry || typeof entry !== 'object') return entry;
  const label = String(entry.label || '');
  const m = label.match(/^教材(\d+)$/);
  if (m) {
    return { ...entry, label: `追加症例${m[1]}` };
  }
  return entry;
}

function sortLessonPresets(list) {
  return list.slice().sort((a, b) => {
    const rank = (p) => {
      if (p.builtin || /^case\d+$/.test(p.id)) {
        return Number(String(p.id).replace(/^case/, '')) || 0;
      }
      return 1000 + (Number(String(p.id).replace(/^L/, '')) || 0);
    };
    return rank(a) - rank(b);
  });
}

/** Published-only (localStorage). Used by instructor delete UI. */
export function listPublishedLessonPresets() {
  return sortLessonPresets(
    readAll()
      .filter((p) => p && p.id && !p.builtin)
      .map(normalizePublishedLabel),
  );
}

/** Student dropdown: built-in teaching cases + instructor-published. */
export function listLessonPresets() {
  const builtins = getBuiltinLessonPresets();
  const published = listPublishedLessonPresets().filter(
    (p) => !builtins.some((b) => b.id === p.id),
  );
  return sortLessonPresets([...builtins, ...published]);
}

export function getLessonPreset(id) {
  return listLessonPresets().find((p) => p.id === id) || null;
}

export function isLessonPresetId(id) {
  return typeof id === 'string' && (/^L\d+$/.test(id) || /^case\d+$/.test(id));
}

/**
 * Register an ad-hoc lesson case in the student preset list.
 * Built-in 症例1〜N come from teaching/cases (sync-builtin-presets); do not use this for those.
 * @param {object} spec - LessonCaseSpec (seed + profile + includes)
 * @param {{ label?: string }} [opts]
 */
export function publishLessonPreset(spec, opts = {}) {
  const list = readAll();
  const nextNum = list.reduce((max, p) => {
    const n = Number(String(p.id).replace(/^L/, '')) || 0;
    return Math.max(max, n);
  }, 0) + 1;
  const id = `L${nextNum}`;
  const label = opts.label || `追加症例${nextNum}`;
  const entry = {
    id,
    label,
    spec: { ...spec },
    createdAt: new Date().toISOString(),
  };
  list.push(entry);
  writeAll(list);
  return entry;
}

export function deleteLessonPreset(id) {
  if (/^case\d+$/.test(String(id))) return; // built-in
  writeAll(readAll().filter((p) => p.id !== id));
}

export function clearLessonPresets() {
  writeAll([]);
}

export function subscribeLessonPresets(onChange) {
  const emit = () => onChange(listLessonPresets());
  const handleCustom = () => emit();
  const handleStorage = (e) => {
    if (e.key === STORAGE_KEY || e.key === null) emit();
  };
  const handleFocus = () => emit();
  const handleVisibility = () => {
    if (document.visibilityState === 'visible') emit();
  };
  window.addEventListener(CHANGE_EVENT, handleCustom);
  window.addEventListener('storage', handleStorage);
  window.addEventListener('focus', handleFocus);
  document.addEventListener('visibilitychange', handleVisibility);
  // 他タブ登録の取りこぼし対策（短間隔）
  const timer = window.setInterval(emit, 2000);
  return () => {
    window.removeEventListener(CHANGE_EVENT, handleCustom);
    window.removeEventListener('storage', handleStorage);
    window.removeEventListener('focus', handleFocus);
    document.removeEventListener('visibilitychange', handleVisibility);
    window.clearInterval(timer);
  };
}
