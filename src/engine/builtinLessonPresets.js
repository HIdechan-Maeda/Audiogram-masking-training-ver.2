/**
 * Built-in teaching cases (症例1 / 症例2) always shown in the student preset list.
 * Specs must match teaching/cases/caseNN.json → generation (see sync-builtin-presets.mjs).
 * Do not expose diagnosis names to students.
 */

import builtinJson from '../data/builtinLessonPresets.json';

/** @returns {{ id: string, label: string, builtin: true, history?: string[], spec: object, createdAt: string }[]} */
export function getBuiltinLessonPresets() {
  return (builtinJson || []).map((row) => ({
    id: row.id,
    label: row.label,
    history: Array.isArray(row.history) ? row.history : [],
    builtin: true,
    spec: { ...row.spec },
    createdAt: 'builtin',
  }));
}
