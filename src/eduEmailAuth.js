export function normalizeSignupEmail(email) {
  return String(email || '').trim().toLowerCase();
}
