import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

export default function InstructorDashboard({ instructor, onLogout }) {
  const [students, setStudents] = useState([]);
  const [stats, setStats] = useState({
    totalStudents: 0,
    activeStudents: 0,
    averageAccuracy: 0,
    totalCompletedCases: 0,
    todayActivity: 0,
  });
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;

  // データを読み込む
  const loadData = async () => {
    setIsLoading(true);
    try {
      // 全学生を取得
      const { data: studentsData, error: studentsError } = await supabase
        .from('students')
        .select('*')
        .order('created_at', { ascending: false });

      if (studentsError) {
        console.error('学生データの取得エラー:', studentsError);
        setIsLoading(false);
        return;
      }

      // 各学生の進捗データを取得
      const studentsWithProgress = await Promise.all(
        (studentsData || []).map(async (student) => {
          const { data: progressData } = await supabase
            .from('student_progress')
            .select('*')
            .eq('student_id', student.student_id)
            .single();

          let progress = null;
          if (progressData && progressData.progress_data) {
            try {
              progress = typeof progressData.progress_data === 'string'
                ? JSON.parse(progressData.progress_data)
                : progressData.progress_data;
            } catch (e) {
              console.error('進捗データのパースエラー:', e);
            }
          }

          return {
            ...student,
            progress,
            lastProgressUpdate: progressData?.updated_at || null,
          };
        })
      );

      setStudents(studentsWithProgress);

      // 統計を計算
      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      const activeStudents = studentsWithProgress.filter(s => {
        if (!s.lastProgressUpdate) return false;
        const lastUpdate = new Date(s.lastProgressUpdate);
        return lastUpdate >= sevenDaysAgo;
      }).length;

      const todayActivity = studentsWithProgress.filter(s => {
        if (!s.lastProgressUpdate) return false;
        const lastUpdate = new Date(s.lastProgressUpdate);
        return lastUpdate >= todayStart;
      }).length;

      const studentsWithAccuracy = studentsWithProgress.filter(s => 
        s.progress && s.progress.caseAccuracy && Object.keys(s.progress.caseAccuracy).length > 0
      );

      const averageAccuracy = studentsWithAccuracy.length > 0
        ? Math.round(
            studentsWithAccuracy.reduce((sum, s) => {
              const accuracies = Object.values(s.progress.caseAccuracy).map(c => c.accuracy || 0);
              const avg = accuracies.reduce((a, b) => a + b, 0) / accuracies.length;
              return sum + avg;
            }, 0) / studentsWithAccuracy.length
          )
        : 0;

      const totalCompletedCases = studentsWithProgress.reduce((sum, s) => {
        return sum + (s.progress?.completedCases?.length || 0);
      }, 0);

      setStats({
        totalStudents: studentsWithProgress.length,
        activeStudents,
        averageAccuracy,
        totalCompletedCases,
        todayActivity,
      });
    } catch (error) {
      console.error('データ読み込みエラー:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // 30秒ごとにデータを更新
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, []);

  // CSVエクスポート
  const exportToCSV = () => {
    const headers = ['学生ID', '登録日', '最終ログイン', '完了症例数', '総症例数', '平均精度', '総セッション数'];
    const rows = filteredStudents.map(student => {
      const completedCases = student.progress?.completedCases?.length || 0;
      const totalCases = 8; // 症例A-H
      const accuracies = student.progress?.caseAccuracy 
        ? Object.values(student.progress.caseAccuracy).map(c => c.accuracy || 0)
        : [];
      const avgAccuracy = accuracies.length > 0
        ? Math.round(accuracies.reduce((a, b) => a + b, 0) / accuracies.length)
        : 0;
      
      return [
        student.student_id,
        new Date(student.created_at).toLocaleDateString('ja-JP'),
        student.lastProgressUpdate ? new Date(student.lastProgressUpdate).toLocaleDateString('ja-JP') : '未ログイン',
        completedCases,
        totalCases,
        `${avgAccuracy}%`,
        student.progress?.totalSessions || 0,
      ];
    });

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `students_progress_${new Date().toISOString().slice(0, 10)}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // フィルタリング
  const filteredStudents = students.filter(student =>
    student.student_id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // ページネーション
  const totalPages = Math.ceil(filteredStudents.length / itemsPerPage);
  const paginatedStudents = filteredStudents.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // 学生詳細の表示
  const showStudentDetail = (student) => {
    setSelectedStudent(student);
  };

  // 進捗リセット
  const resetStudentProgress = async (studentId) => {
    if (!window.confirm(`学生ID: ${studentId} の進捗をリセットしますか？この操作は取り消せません。`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from('student_progress')
        .delete()
        .eq('student_id', studentId);

      if (error) throw error;

      alert('進捗データをリセットしました');
      loadData();
      setSelectedStudent(null);
    } catch (error) {
      console.error('リセットエラー:', error);
      alert('進捗データのリセットに失敗しました');
    }
  };

  return (
    <div className="w-full min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* ヘッダー */}
        <header className="bg-white rounded-2xl shadow p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Audioscope EDU - 講師用ダッシュボード</h1>
              <p className="text-sm text-gray-600 mt-1">講師: {instructor.name}</p>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={loadData}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                disabled={isLoading}
              >
                {isLoading ? '更新中...' : '🔄 更新'}
              </button>
              <button
                onClick={onLogout}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
              >
                ログアウト
              </button>
            </div>
          </div>
        </header>

        {/* 統計カード */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
          <div className="bg-blue-50 rounded-xl p-5 border border-blue-200">
            <div className="text-sm text-blue-600 font-medium mb-1">総学生数</div>
            <div className="text-3xl font-bold text-blue-800">{stats.totalStudents}</div>
          </div>
          <div className="bg-green-50 rounded-xl p-5 border border-green-200">
            <div className="text-sm text-green-600 font-medium mb-1">アクティブ学生</div>
            <div className="text-3xl font-bold text-green-800">{stats.activeStudents}</div>
            <div className="text-xs text-green-600 mt-1">過去7日以内</div>
          </div>
          <div className="bg-orange-50 rounded-xl p-5 border border-orange-200">
            <div className="text-sm text-orange-600 font-medium mb-1">平均精度</div>
            <div className="text-3xl font-bold text-orange-800">{stats.averageAccuracy}%</div>
          </div>
          <div className="bg-purple-50 rounded-xl p-5 border border-purple-200">
            <div className="text-sm text-purple-600 font-medium mb-1">完了症例数</div>
            <div className="text-3xl font-bold text-purple-800">{stats.totalCompletedCases}</div>
            <div className="text-xs text-purple-600 mt-1">全学生合計</div>
          </div>
          <div className="bg-indigo-50 rounded-xl p-5 border border-indigo-200">
            <div className="text-sm text-indigo-600 font-medium mb-1">本日の活動</div>
            <div className="text-3xl font-bold text-indigo-800">{stats.todayActivity}</div>
            <div className="text-xs text-indigo-600 mt-1">ログイン数</div>
          </div>
        </div>

        {/* 検索・エクスポートバー */}
        <div className="bg-white rounded-2xl shadow p-4 mb-6">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <input
                type="text"
                placeholder="🔍 学生IDで検索..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              onClick={exportToCSV}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2"
            >
              <span>📥</span>
              <span>CSV出力</span>
            </button>
          </div>
        </div>

        {/* 学生一覧テーブル */}
        <div className="bg-white rounded-2xl shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">学生ID</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">完了症例</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">平均精度</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">総セッション</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">最終ログイン</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">アクション</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {isLoading ? (
                  <tr>
                    <td colSpan="6" className="px-6 py-8 text-center text-gray-500">
                      データを読み込んでいます...
                    </td>
                  </tr>
                ) : paginatedStudents.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="px-6 py-8 text-center text-gray-500">
                      {searchTerm ? '検索結果が見つかりませんでした' : '学生データがありません'}
                    </td>
                  </tr>
                ) : (
                  paginatedStudents.map((student) => {
                    const completedCases = student.progress?.completedCases?.length || 0;
                    const totalCases = 8;
                    const accuracies = student.progress?.caseAccuracy
                      ? Object.values(student.progress.caseAccuracy).map(c => c.accuracy || 0)
                      : [];
                    const avgAccuracy = accuracies.length > 0
                      ? Math.round(accuracies.reduce((a, b) => a + b, 0) / accuracies.length)
                      : 0;

                    return (
                      <tr key={student.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">{student.student_id}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">
                            {completedCases}/{totalCases}
                          </div>
                          <div className="w-32 bg-gray-200 rounded-full h-2 mt-1">
                            <div
                              className="bg-blue-600 h-2 rounded-full"
                              style={{ width: `${(completedCases / totalCases) * 100}%` }}
                            />
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className={`text-sm font-semibold ${
                            avgAccuracy >= 90 ? 'text-green-600' :
                            avgAccuracy >= 70 ? 'text-yellow-600' : 'text-red-600'
                          }`}>
                            {avgAccuracy}%
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">
                            {student.progress?.totalSessions || 0}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">
                            {student.lastProgressUpdate
                              ? new Date(student.lastProgressUpdate).toLocaleString('ja-JP')
                              : '未ログイン'}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <button
                            onClick={() => showStudentDetail(student)}
                            className="text-blue-600 hover:text-blue-900 mr-3"
                          >
                            詳細
                          </button>
                          <button
                            onClick={() => resetStudentProgress(student.student_id)}
                            className="text-red-600 hover:text-red-900"
                          >
                            リセット
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* ページネーション */}
          {totalPages > 1 && (
            <div className="bg-gray-50 px-6 py-4 flex items-center justify-between border-t border-gray-200">
              <div className="text-sm text-gray-700">
                {filteredStudents.length}件中 {(currentPage - 1) * itemsPerPage + 1}-
                {Math.min(currentPage * itemsPerPage, filteredStudents.length)}件を表示
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1 border rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  前へ
                </button>
                <span className="px-3 py-1 text-sm">
                  {currentPage} / {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1 border rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  次へ
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 学生詳細モーダル */}
      {selectedStudent && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold text-gray-900">
                  学生詳細: {selectedStudent.student_id}
                </h2>
                <button
                  onClick={() => setSelectedStudent(null)}
                  className="text-gray-400 hover:text-gray-600 text-2xl"
                >
                  ×
                </button>
              </div>

              <div className="space-y-6">
                {/* 基本情報 */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <h3 className="font-semibold text-gray-800 mb-3">基本情報</h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-600">登録日:</span>{' '}
                      <span className="font-medium">
                        {new Date(selectedStudent.created_at).toLocaleString('ja-JP')}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-600">最終ログイン:</span>{' '}
                      <span className="font-medium">
                        {selectedStudent.lastProgressUpdate
                          ? new Date(selectedStudent.lastProgressUpdate).toLocaleString('ja-JP')
                          : '未ログイン'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 進捗詳細 */}
                {selectedStudent.progress && (
                  <>
                    <div className="bg-blue-50 rounded-lg p-4">
                      <h3 className="font-semibold text-gray-800 mb-3">進捗サマリー</h3>
                      <div className="grid grid-cols-3 gap-4 text-sm">
                        <div>
                          <span className="text-gray-600">総セッション数:</span>{' '}
                          <span className="font-medium">{selectedStudent.progress.totalSessions || 0}</span>
                        </div>
                        <div>
                          <span className="text-gray-600">完了症例数:</span>{' '}
                          <span className="font-medium">
                            {selectedStudent.progress.completedCases?.length || 0}/8
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-600">最終セッション:</span>{' '}
                          <span className="font-medium">
                            {selectedStudent.progress.lastSessionDate
                              ? new Date(selectedStudent.progress.lastSessionDate).toLocaleDateString('ja-JP')
                              : '未実施'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* 症例別進捗 */}
                    {selectedStudent.progress.caseAccuracy && Object.keys(selectedStudent.progress.caseAccuracy).length > 0 && (
                      <div className="bg-green-50 rounded-lg p-4">
                        <h3 className="font-semibold text-gray-800 mb-3">症例別進捗</h3>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          {['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map(caseId => {
                            const caseData = selectedStudent.progress.caseAccuracy[caseId];
                            const isCompleted = selectedStudent.progress.completedCases?.includes(caseId);

                            return (
                              <div
                                key={caseId}
                                className={`p-3 rounded-lg border text-center ${
                                  isCompleted
                                    ? 'bg-white border-green-300'
                                    : 'bg-gray-100 border-gray-300'
                                }`}
                              >
                                <div className="font-semibold text-gray-800">症例{caseId}</div>
                                {isCompleted && caseData ? (
                                  <>
                                    <div className="text-lg font-bold text-green-600 mt-1">
                                      {caseData.accuracy}%
                                    </div>
                                    <div className="text-xs text-gray-600 mt-1">
                                      {caseData.correct}/{caseData.total}
                                    </div>
                                    {caseData.completedAt && (
                                      <div className="text-xs text-gray-500 mt-1">
                                        {new Date(caseData.completedAt).toLocaleDateString('ja-JP')}
                                      </div>
                                    )}
                                  </>
                                ) : (
                                  <div className="text-sm text-gray-500 mt-1">未完了</div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </>
                )}

                {!selectedStudent.progress && (
                  <div className="bg-yellow-50 rounded-lg p-4 text-center text-gray-600">
                    進捗データがありません
                  </div>
                )}
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  onClick={() => resetStudentProgress(selectedStudent.student_id)}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                >
                  進捗をリセット
                </button>
                <button
                  onClick={() => setSelectedStudent(null)}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                >
                  閉じる
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}








