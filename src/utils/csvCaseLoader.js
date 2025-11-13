/**
 * CSV症例データベース読み込みユーティリティ
 * 
 * CSVファイルを読み込んでJSON形式に変換し、既存のコードと互換性のある形式で返す
 */

/**
 * CSV文字列をパースしてオブジェクト配列に変換
 * @param {string} csvText - CSV文字列
 * @returns {Array} 症例オブジェクトの配列
 */
function parseCSV(csvText) {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) return [];
  
  // ヘッダー行を取得
  const headers = lines[0].split(',').map(h => h.trim());
  
  // データ行をパース
  const cases = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    // CSVのパース（カンマ区切り、ダブルクォート対応）
    const values = parseCSVLine(line);
    
    if (values.length !== headers.length) {
      console.warn(`CSV行 ${i + 1} のカラム数が一致しません: ${values.length} vs ${headers.length}`);
      continue;
    }
    
    const caseObj = {};
    headers.forEach((header, index) => {
      let value = values[index]?.trim() || '';
      
      // 数値フィールドの変換（聴力データは含めない）
      if (header === 'caseId' || header === 'age_min' || header === 'age_max') {
        value = value === '' ? null : Number(value);
        if (isNaN(value)) value = null;
      }
      
      // その他のフィールド（聴力データは自動生成されるため含めない）
      caseObj[header] = value || null;
    });
    
    cases.push(caseObj);
  }
  
  return cases;
}

/**
 * CSV行をパース（ダブルクォート対応）
 * @param {string} line - CSV行
 * @returns {Array<string>} 値の配列
 */
function parseCSVLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // エスケープされたダブルクォート
        current += '"';
        i++;
      } else {
        // クォートの開始/終了
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      // カラムの区切り
      values.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  
  // 最後のカラム
  values.push(current);
  
  return values;
}

/**
 * 疾患名からCSVファイルパスを取得
 * @param {string} disorderName - 疾患名（AOM, OME, MUMPSなど）
 * @returns {string} CSVファイルパス
 */
function getCSVPath(disorderName) {
  const nameMap = {
    'AOM': 'AOM',
    'OME': 'OME',
    'MUMPS': 'MUMPS',
    'SUDDEN': 'SUDDEN',
    'MENIERE': 'MENIERE',
    'OTOSCLEROSIS': 'OTOSCLEROSIS',
    'NOISE': 'NOISE',
    'PRESBYCUSIS': 'PRESBYCUSIS',
    'OSSICULAR_DISCONTINUITY': 'OSSICULAR_DISCONTINUITY',
    'ACOUSTIC_TRAUMA': 'ACOUSTIC_TRAUMA',
    'NORMAL': 'NORMAL'
  };
  
  const fileName = nameMap[disorderName.toUpperCase()] || disorderName.toUpperCase();
  // publicフォルダ内のCSVファイルにアクセス
  return `${process.env.PUBLIC_URL || ''}/data/${fileName}.csv`;
}

/**
 * CSVファイルを読み込んで症例データを返す
 * @param {string} disorderName - 疾患名
 * @returns {Promise<Array>} 症例データの配列
 */
export async function loadCaseDatabase(disorderName) {
  try {
    const csvPath = getCSVPath(disorderName);
    const response = await fetch(csvPath);
    
    if (!response.ok) {
      console.warn(`CSVファイルが見つかりません: ${csvPath}`);
      return [];
    }
    
    const csvText = await response.text();
    const cases = parseCSV(csvText);
    
    // 既存のJSON形式に合わせて変換（聴力データとティンパノグラム型は自動生成されるため含めない）
    // AI症例生成で使用するのは基本情報、主訴、鼓膜所見のみ
    return cases.map(c => ({
      caseId: c.caseId,
      chiefComplaint: c.chiefComplaint,
      otoscopy: c.otoscopy,
      age_min: c.age_min || null,
      age_max: c.age_max || null,
      gender: c.gender || null
      // hpi, notes はAI症例生成では使用しない
      // ac, bc_all, bc, tympanogram は自動生成されるため含めない
    }));
  } catch (error) {
    console.error(`CSV読み込みエラー (${disorderName}):`, error);
    return [];
  }
}

/**
 * 複数の疾患データを一度に読み込む
 * @param {Array<string>} disorderNames - 疾患名の配列
 * @returns {Promise<Object>} 疾患名をキーとした症例データのオブジェクト
 */
export async function loadMultipleCaseDatabases(disorderNames) {
  const results = {};
  
  await Promise.all(
    disorderNames.map(async (name) => {
      results[name] = await loadCaseDatabase(name);
    })
  );
  
  return results;
}

/**
 * 利用可能な全ての疾患データを読み込む
 * @returns {Promise<Object>} 全疾患の症例データ
 */
export async function loadAllCaseDatabases() {
  const disorders = [
    'NORMAL', 'AOM', 'OME', 'MUMPS', 'SUDDEN', 'MENIERE',
    'OTOSCLEROSIS', 'NOISE', 'PRESBYCUSIS', 'OSSICULAR_DISCONTINUITY', 'ACOUSTIC_TRAUMA'
  ];
  
  return await loadMultipleCaseDatabases(disorders);
}

