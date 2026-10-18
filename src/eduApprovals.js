import { supabase, isSupabaseDisabled } from './supabaseClient';
import { normalizeSignupEmail } from './eduEmailAuth';

const TABLE = 'edu_signup_approvals';
const LOCAL_KEY = 'edu_signup_approvals';

export const APPROVAL_SETUP_MESSAGE =
  '承認用の表がまだありません。SupabaseのSQLエディタで supabase_edu_approvals.sql を1回実行してください。';

let tableReady = null;

function isMissingTable(error) {
  if (!error) return false;
  const message = error.message || '';
  return error.code === '42P01' || error.code === 'PGRST205' || /does not exist|schema cache/i.test(message);
}

function loadLocal() {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}

function saveLocal(requests) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(requests));
}

async function ensureTable() {
  if (isSupabaseDisabled) return false;
  if (tableReady !== null) {
    if (!tableReady) throw new Error(APPROVAL_SETUP_MESSAGE);
    return true;
  }
  const { error } = await supabase.from(TABLE).select('email').limit(1);
  if (!error) {
    tableReady = true;
    return true;
  }
  tableReady = false;
  if (isMissingTable(error)) throw new Error(APPROVAL_SETUP_MESSAGE);
  throw error;
}

function rowsFromLocal() {
  return Object.entries(loadLocal())
    .map(([email, row]) => ({
      email,
      status: row.status,
      created_at: row.createdAt,
      updated_at: row.updatedAt,
    }))
    .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
}

export async function getApprovalStatus(email) {
  const normalized = normalizeSignupEmail(email);
  if (!normalized) return null;
  if (!(await ensureTable())) {
    return loadLocal()[normalized]?.status || null;
  }
  const { data, error } = await supabase.from(TABLE).select('status').eq('email', normalized).maybeSingle();
  if (error) throw error;
  return data?.status || null;
}

export async function requestApproval(email) {
  const normalized = normalizeSignupEmail(email);
  const current = await getApprovalStatus(normalized);
  if (current) return current;
  const now = new Date().toISOString();
  if (!(await ensureTable())) {
    const requests = loadLocal();
    requests[normalized] = { status: 'pending', createdAt: now, updatedAt: now };
    saveLocal(requests);
    return 'pending';
  }
  const { error } = await supabase.from(TABLE).insert({
    email: normalized,
    status: 'pending',
    created_at: now,
    updated_at: now,
  });
  if (error && error.code !== '23505' && !/duplicate|unique/i.test(error.message || '')) throw error;
  return (await getApprovalStatus(normalized)) || 'pending';
}

export async function listApprovals() {
  if (!(await ensureTable())) return rowsFromLocal();
  const { data, error } = await supabase
    .from(TABLE)
    .select('email,status,created_at,updated_at')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function setApprovalStatus(email, status) {
  const normalized = normalizeSignupEmail(email);
  if (!normalized || !normalized.includes('@')) {
    throw new Error('メールアドレスを確認してください');
  }
  if (!['pending', 'approved', 'rejected'].includes(status)) {
    throw new Error('状態が不正です');
  }
  const now = new Date().toISOString();
  if (!(await ensureTable())) {
    const requests = loadLocal();
    const prev = requests[normalized] || {};
    requests[normalized] = {
      status,
      createdAt: prev.createdAt || now,
      updatedAt: now,
    };
    saveLocal(requests);
    return;
  }
  const { data: existing, error: readError } = await supabase
    .from(TABLE)
    .select('email')
    .eq('email', normalized)
    .maybeSingle();
  if (readError) throw readError;
  if (existing) {
    const { error } = await supabase.from(TABLE).update({ status, updated_at: now }).eq('email', normalized);
    if (error) throw error;
    return;
  }
  const { error } = await supabase.from(TABLE).insert({
    email: normalized,
    status,
    created_at: now,
    updated_at: now,
  });
  if (error) throw error;
}
