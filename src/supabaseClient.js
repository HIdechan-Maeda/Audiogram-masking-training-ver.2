import { createClient } from '@supabase/supabase-js'

// Supabaseを無効化する場合は、このフラグをtrueに設定
// ローカルストレージのみで動作します
const DISABLE_SUPABASE = true; // trueにするとSupabaseを完全に無効化

const supabaseUrl = 'https://iqasbrvsxvudhrvtzoyw.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlxYXNicnZzeHZ1ZGhydnR6b3l3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE1OTg3OTgsImV4cCI6MjA3NzE3NDc5OH0.Pxt0fYzVoOPVfxup7vcrrdh3a5fXUczsoX5Vbz3wVzA'

// クエリチェーン用モック（select / insert / upsert など最低限のメソッドを連結可能にする）
function createMockQueryChain() {
  const chain = {
    eq() {
      return chain;
    },
    order() {
      return chain;
    },
    limit() {
      return Promise.resolve({ data: [], error: null });
    },
    async single() {
      return { data: null, error: { code: 'PGRST116' } };
    },
  };
  return chain;
}

// Supabaseが無効化されている場合は、モッククライアントを作成
export const supabase = DISABLE_SUPABASE
  ? {
      auth: {
        signInAnonymously: async () => ({
          data: { user: { id: `local_${Date.now()}` } },
          error: null,
        }),
      },
      from: () => ({
        select: () => createMockQueryChain(),
        insert: async () => ({ data: null, error: null }),
        update: async () => ({ error: null }),
        upsert: async () => ({ error: null }),
        delete: async () => ({ error: null }),
      }),
    }
  : createClient(supabaseUrl, supabaseAnonKey)

// Supabaseが無効化されているかどうかをエクスポート
export const isSupabaseDisabled = DISABLE_SUPABASE
