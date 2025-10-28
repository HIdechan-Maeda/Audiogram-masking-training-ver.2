const { useState, useEffect } = React;

// 言語聴覚士国家試験サンプル問題
const sampleQuestions = [
    {
        id: 1,
        category: '音声・嚥下障害',
        question: '声帯麻痺で最も多い原因はどれか。',
        choices: [
            '外傷',
            'ウイルス感染',
            '原因不明（特発性）',
            '脳血管疾患'
        ],
        correct: 2,
        explanation: '特発性が最も多く、次いで脳血管疾患、外傷、ウイルス感染の順です。'
    },
    {
        id: 2,
        category: '言語発達',
        question: '小児の正常な語彙数について、2歳児の平均語彙数はどれか。',
        choices: [
            '50語程度',
            '150語程度',
            '300語程度',
            '500語以上'
        ],
        correct: 1,
        explanation: '2歳児の平均語彙数は約150語です。3歳で1,000語、4歳で1,600語程度に増加します。'
    },
    {
        id: 3,
        category: '聴覚障害',
        question: '新生児聴覚スクリーニングの適応年齢はどれか。',
        choices: [
            '生後24時間以内',
            '生後3日以内',
            '生後1ヶ月以内',
            '生後6ヶ月以内'
        ],
        correct: 2,
        explanation: '新生児聴覚スクリーニングは、生後3日以内（できれば生後48時間以内）に実施することが望ましいとされています。'
    },
    {
        id: 4,
        category: '構音障害',
        question: '機能性構音障害で最も多い音の誤りはどれか。',
        choices: [
            '/r/音の誤り',
            '/s/音の誤り',
            '/k/音の誤り',
            '/t/音の誤り'
        ],
        correct: 0,
        explanation: '/r/音（ラ行）の誤りが最も多く、次いで/s/音（サ行）、/k/音（カ行）の順です。'
    },
    {
        id: 5,
        category: '失語症',
        question: 'ブローカ失語症の特徴で正しいのはどれか。',
        choices: [
            '構文障害は軽度',
            '復唱は良好',
            '理解は比較的良好だが表出が重度',
            '字性失語を伴うことが多い'
        ],
        correct: 2,
        explanation: 'ブローカ失語は、理解は比較的保たれるが、表出が重度に障害されるのが特徴です。復唱は不良です。'
    },
    {
        id: 6,
        category: '高次脳機能障害',
        question: '注意障害の評価に用いられる検査はどれか。',
        choices: [
            'ウェクスラー成人知能検査',
            '標準失語症検査',
            'Trail Making Test',
            'ピッツバーグ睡眠評価質問票'
        ],
        correct: 2,
        explanation: 'Trail Making Test（TMT）は、注意機能や遂行機能を評価するために用いられます。'
    },
    {
        id: 7,
        category: '嚥下機能',
        question: '嚥下造影検査で確認すべき項目でないのはどれか。',
        choices: [
            '摂食嚥下の姿勢',
            '咽頭残留',
            '胃酸分泌量',
            '誤嚥の有無'
        ],
        correct: 2,
        explanation: '胃酸分泌量は嚥下造影では評価できません。姿勢、残留、誤嚥の有無、咽頭への流入などが確認されます。'
    },
    {
        id: 8,
        category: '音声障害',
        question: '音声の基本的な属性（音の三要素）に含まれないのはどれか。',
        choices: [
            'ピッチ（音高）',
            'ラウドネス（音の大きさ）',
            'クオリティ（音質）',
            'ディスプレイメント（変位）'
        ],
        correct: 3,
        explanation: '音の三要素は、ピッチ（音高）、ラウドネス（音の大きさ）、クオリティ（音質）です。'
    }
];

function App() {
    const [questions, setQuestions] = useState(sampleQuestions);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [selectedAnswer, setSelectedAnswer] = useState(null);
    const [showAnswer, setShowAnswer] = useState(false);
    const [score, setScore] = useState(0);
    const [totalAnswered, setTotalAnswered] = useState(0);
    const [reviewMode, setReviewMode] = useState(false);
    const [incorrectQuestions, setIncorrectQuestions] = useState([]);

    const currentQuestion = questions[currentIndex];
    const isCorrect = selectedAnswer === currentQuestion.correct;

    const handleAnswer = (index) => {
        if (showAnswer) return;
        setSelectedAnswer(index);
        setShowAnswer(true);
        setTotalAnswered(prev => prev + 1);
        if (index === currentQuestion.correct) {
            setScore(prev => prev + 1);
        } else {
            setIncorrectQuestions(prev => [...prev, currentQuestion]);
        }
    };

    const handleNext = () => {
        if (currentIndex < questions.length - 1) {
            setCurrentIndex(prev => prev + 1);
            setSelectedAnswer(null);
            setShowAnswer(false);
        }
    };

    const handlePrevious = () => {
        if (currentIndex > 0) {
            setCurrentIndex(prev => prev - 1);
            setSelectedAnswer(null);
            setShowAnswer(false);
        }
    };

    const handleReview = () => {
        if (incorrectQuestions.length === 0) {
            alert('復習する問題がありません！');
            return;
        }
        setQuestions(incorrectQuestions);
        setCurrentIndex(0);
        setIncorrectQuestions([]);
        setReviewMode(true);
        setShowAnswer(false);
        setSelectedAnswer(null);
    };

    const handleReset = () => {
        setQuestions(sampleQuestions);
        setCurrentIndex(0);
        setSelectedAnswer(null);
        setShowAnswer(false);
        setScore(0);
        setTotalAnswered(0);
        setIncorrectQuestions([]);
        setReviewMode(false);
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
            <div className="max-w-4xl mx-auto">
                {/* ヘッダー */}
                <header className="bg-white rounded-lg shadow-md p-6 mb-6">
                    <h1 className="text-3xl font-bold text-gray-800 mb-2">言語聴覚士国家試験対策</h1>
                    <p className="text-gray-600">ST（Speech-Language-Hearing Therapist）国家試験の過去問対策</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                        <span className="bg-indigo-100 text-indigo-800 px-3 py-1 rounded-full text-xs">発達</span>
                        <span className="bg-indigo-100 text-indigo-800 px-3 py-1 rounded-full text-xs">失語症</span>
                        <span className="bg-indigo-100 text-indigo-800 px-3 py-1 rounded-full text-xs">嚥下</span>
                        <span className="bg-indigo-100 text-indigo-800 px-3 py-1 rounded-full text-xs">聴覚</span>
                        <span className="bg-indigo-100 text-indigo-800 px-3 py-1 rounded-full text-xs">音声</span>
                    </div>
                </header>

                {/* スコア表示 */}
                <div className="bg-white rounded-lg shadow-md p-6 mb-6">
                    <div className="grid grid-cols-3 gap-4 text-center">
                        <div className="bg-blue-50 rounded-lg p-4">
                            <div className="text-2xl font-bold text-blue-600">{score}</div>
                            <div className="text-sm text-gray-600">正解数</div>
                        </div>
                        <div className="bg-green-50 rounded-lg p-4">
                            <div className="text-2xl font-bold text-green-600">
                                {totalAnswered > 0 ? Math.round((score / totalAnswered) * 100) : 0}%
                            </div>
                            <div className="text-sm text-gray-600">正答率</div>
                        </div>
                        <div className="bg-purple-50 rounded-lg p-4">
                            <div className="text-2xl font-bold text-purple-600">{incorrectQuestions.length}</div>
                            <div className="text-sm text-gray-600">復習問題</div>
                        </div>
                    </div>
                </div>

                {/* 問題カード */}
                <div className="bg-white rounded-lg shadow-md p-8 mb-6">
                    <div className="mb-4">
                        <span className="bg-indigo-100 text-indigo-800 px-3 py-1 rounded-full text-sm font-medium">
                            {currentQuestion.category}
                        </span>
                        <span className="ml-4 text-gray-500">
                            問題 {currentIndex + 1} / {questions.length}
                        </span>
                    </div>

                    <h2 className="text-xl font-semibold text-gray-800 mb-6">
                        {currentQuestion.question}
                    </h2>

                    <div className="space-y-3">
                        {currentQuestion.choices.map((choice, index) => {
                            let bgColor = 'bg-gray-100 hover:bg-gray-200';
                            
                            if (showAnswer) {
                                if (index === currentQuestion.correct) {
                                    bgColor = 'bg-green-100 border-2 border-green-500';
                                } else if (index === selectedAnswer && index !== currentQuestion.correct) {
                                    bgColor = 'bg-red-100 border-2 border-red-500';
                                }
                            }

                            return (
                                <button
                                    key={index}
                                    onClick={() => handleAnswer(index)}
                                    disabled={showAnswer}
                                    className={`w-full text-left p-4 rounded-lg transition-all ${bgColor} ${
                                        showAnswer ? '' : 'cursor-pointer active:scale-95'
                                    }`}
                                >
                                    <div className="flex items-center">
                                        <span className="font-bold mr-3 w-8 h-8 flex items-center justify-center rounded-full bg-white">
                                            {index + 1}
                                        </span>
                                        <span className="flex-1">{choice}</span>
                                        {showAnswer && index === currentQuestion.correct && (
                                            <span className="text-green-600 font-bold ml-2">✓</span>
                                        )}
                                        {showAnswer && index === selectedAnswer && index !== currentQuestion.correct && (
                                            <span className="text-red-600 font-bold ml-2">✗</span>
                                        )}
                                    </div>
                                </button>
                            );
                        })}
                    </div>

                    {/* 解説 */}
                    {showAnswer && (
                        <div className="mt-6 p-4 bg-indigo-50 rounded-lg border border-indigo-200">
                            <div className="font-semibold text-indigo-800 mb-2">解説</div>
                            <div className="text-gray-700">{currentQuestion.explanation}</div>
                        </div>
                    )}
                </div>

                {/* ナビゲーションボタン */}
                <div className="bg-white rounded-lg shadow-md p-6">
                    <div className="flex justify-between items-center">
                        <button
                            onClick={handlePrevious}
                            disabled={currentIndex === 0}
                            className="px-6 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                        >
                            ← 前の問題
                        </button>

                        <div className="space-x-3">
                            <button
                                onClick={handleReview}
                                disabled={incorrectQuestions.length === 0}
                                className="px-6 py-3 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                            >
                                間違えた問題を復習
                            </button>
                            <button
                                onClick={handleReset}
                                className="px-6 py-3 bg-gray-500 text-white rounded-lg hover:bg-gray-600 font-medium"
                            >
                                最初からやり直す
                            </button>
                        </div>

                        <button
                            onClick={handleNext}
                            disabled={currentIndex === questions.length - 1}
                            className="px-6 py-3 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                        >
                            次の問題 →
                        </button>
                    </div>
                </div>

                {/* 進捗バー */}
                <div className="mt-6">
                    <div className="flex justify-between text-sm text-gray-600 mb-2">
                        <span>進捗</span>
                        <span>{currentIndex + 1} / {questions.length}</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-3">
                        <div
                            className="bg-indigo-500 h-3 rounded-full transition-all duration-300"
                            style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}

ReactDOM.render(<App />, document.getElementById('root'));
