/**
 * Built-in teaching cases (症例1 / 症例2) always shown in the student preset list.
 * Specs must match teaching/cases/caseNN.json → generation (see sync-builtin-presets.mjs).
 */

import builtinJson from '../data/builtinLessonPresets.json';

/** @returns {{ id: string, label: string, builtin: true, diagnosis?: string, spec: object, createdAt: string }[]} */
export function getBuiltinLessonPresets() {
  return (builtinJson || []).map((row) => ({
    id: row.id,
    label: row.label,
    diagnosis: row.diagnosis,
    builtin: true,
    spec: { ...row.spec },
    createdAt: 'builtin',
  }));
}
