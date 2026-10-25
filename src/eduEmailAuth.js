export function normalizeSignupEmail(email) {
  return String(email || '').trim().toLowerCase();
}

const INSTRUCTOR_SESSION_KEY = 'instructor_session';

export function readInstructorSession() {
  try {
    const raw = localStorage.getItem(INSTRUCTOR_SESSION_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data?.instructorId) return null;
    return data;
  } catch (e) {
    return null;
  }
}

/** 講師ダッシュボードから開いた学生画面。講師ログイン済みのときだけ有効。 */
export function readStaffInstructor() {
  try {
    if (new URLSearchParams(window.location.search).get('staff') !== '1') return null;
  } catch (e) {
    return null;
  }
  return readInstructorSession();
}

export function staffStudentId(instructor) {
  return `講師:${instructor.instructorId}`;
}
