import React, { useState } from 'react';
import { supabase } from './supabaseClient';

export default function InstructorLogin({ onLogin }) {
  const [instructorId, setInstructorId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // テスト用の簡易認証（テーブルがなくても動作）
  const TEST_INSTRUCTORS = {
    'instructor01': { id: 1, instructorId: 'instructor01', name: '講師1', password: 'password01' },
    'instructor02': { id: 2, instructorId: 'instructor02', name: '講師2', password: 'password02' },
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!instructorId.trim() || !password.trim()) {
      setError('講師IDとパスワードを入力してください');
      return;
    }

    setIsLoading(true);
    setError('');

    const normalizedId = instructorId.trim().toLowerCase();

    // まずテスト用の簡易認証を試す
    if (TEST_INSTRUCTORS[normalizedId] && TEST_INSTRUCTORS[normalizedId].password === password) {
      // テスト用ログイン成功
      console.log('テスト用ログイン成功（Supabaseテーブル未使用）');
      onLogin({
        id: TEST_INSTRUCTORS[normalizedId].id,
        instructorId: TEST_INSTRUCTORS[normalizedId].instructorId,
        name: TEST_INSTRUCTORS[normalizedId].name,
      });
      setIsLoading(false);
      return;
    }

    // Supabaseから講師情報を取得（テーブルが存在する場合）
    try {
      const { data: instructor, error: fetchError } = await supabase
        .from('instructors')
        .select('*')
        .eq('instructor_id', normalizedId)
        .single();

      // エラーの詳細を確認
      if (fetchError) {
        console.error('Supabaseエラー:', fetchError);
        
        // テーブルが存在しない場合はテスト用認証にフォールバック
        if (fetchError.code === '42P01' || fetchError.message?.includes('does not exist')) {
          // テスト用認証を再試行
          if (TEST_INSTRUCTORS[normalizedId] && TEST_INSTRUCTORS[normalizedId].password === password) {
            console.log('テスト用ログイン成功（テーブル未作成のためテストモード）');
            onLogin({
              id: TEST_INSTRUCTORS[normalizedId].id,
              instructorId: TEST_INSTRUCTORS[normalizedId].instructorId,
              name: TEST_INSTRUCTORS[normalizedId].name,
            });
            setIsLoading(false);
            return;
          }
          setError('instructorsテーブルが存在しません。テスト用アカウント: instructor01/password01 または instructor02/password02');
          setIsLoading(false);
          return;
        }
        
        // その他のエラー
        if (fetchError.code === 'PGRST116') {
          // レコードが見つからない場合はテスト用認証を再試行
          if (TEST_INSTRUCTORS[normalizedId] && TEST_INSTRUCTORS[normalizedId].password === password) {
            console.log('テスト用ログイン成功（レコード未作成のためテストモード）');
            onLogin({
              id: TEST_INSTRUCTORS[normalizedId].id,
              instructorId: TEST_INSTRUCTORS[normalizedId].instructorId,
              name: TEST_INSTRUCTORS[normalizedId].name,
            });
            setIsLoading(false);
            return;
          }
          setError('講師IDまたはパスワードが正しくありません');
        } else {
          setError(`データベースエラー: ${fetchError.message || fetchError.code}`);
        }
        setIsLoading(false);
        return;
      }

      if (!instructor) {
        // Supabaseにレコードがない場合はテスト用認証を再試行
        if (TEST_INSTRUCTORS[normalizedId] && TEST_INSTRUCTORS[normalizedId].password === password) {
          console.log('テスト用ログイン成功（レコード未作成のためテストモード）');
          onLogin({
            id: TEST_INSTRUCTORS[normalizedId].id,
            instructorId: TEST_INSTRUCTORS[normalizedId].instructorId,
            name: TEST_INSTRUCTORS[normalizedId].name,
          });
          setIsLoading(false);
          return;
        }
        setError('講師IDまたはパスワードが正しくありません');
        setIsLoading(false);
        return;
      }

      // パスワードの検証（簡易版：本番環境ではbcryptなどを使う）
      // 注意: 現在は平文で保存されている場合を想定（セキュリティ強化が必要）
      if (instructor.password_hash !== password) {
        setError('講師IDまたはパスワードが正しくありません');
        setIsLoading(false);
        return;
      }

      // Supabaseからのログイン成功
      console.log('Supabaseからのログイン成功');
      onLogin({
        id: instructor.id,
        instructorId: instructor.instructor_id,
        name: instructor.name || instructor.instructor_id,
      });
    } catch (err) {
      console.error('ログインエラー:', err);
      // エラー時もテスト用認証を試す
      if (TEST_INSTRUCTORS[normalizedId] && TEST_INSTRUCTORS[normalizedId].password === password) {
        console.log('テスト用ログイン成功（エラー時のフォールバック）');
        onLogin({
          id: TEST_INSTRUCTORS[normalizedId].id,
          instructorId: TEST_INSTRUCTORS[normalizedId].instructorId,
          name: TEST_INSTRUCTORS[normalizedId].name,
        });
        setIsLoading(false);
        return;
      }
      setError(`ログインに失敗しました: ${err.message || '不明なエラー'}\n\nブラウザのコンソール（F12）で詳細を確認してください。`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full mx-4">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">HearSim - 講師用ダッシュボード</h1>
          <p className="text-gray-600">講師IDとパスワードでログインしてください</p>
        </div>
        
        <form onSubmit={handleLogin} className="space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
              {error}
            </div>
          )}
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">講師ID</label>
            <input
              type="text"
              value={instructorId}
              onChange={(e) => setInstructorId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="例: instructor01"
              disabled={isLoading}
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">パスワード</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="パスワード"
              disabled={isLoading}
            />
          </div>
          
          <button
            type="submit"
            disabled={!instructorId.trim() || !password.trim() || isLoading}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            {isLoading ? 'ログイン中...' : 'ログイン'}
          </button>
        </form>
        
        <div className="mt-6 text-center text-sm text-gray-500">
          実証実験用の講師アカウントでログインしてください
        </div>
        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700">
          <div className="font-semibold mb-1">テスト用アカウント:</div>
          <div>講師ID: instructor01 / パスワード: password01</div>
          <div>講師ID: instructor02 / パスワード: password02</div>
        </div>
      </div>
    </div>
  );
}

