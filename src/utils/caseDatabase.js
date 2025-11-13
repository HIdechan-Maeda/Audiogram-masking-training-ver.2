/**
 * 症例データベース統合モジュール
 * CSVとJSONの両方に対応し、既存コードとの互換性を保つ
 */

import AOMCases from '../data/AOM_cases.json';
import OMECases from '../data/OME_cases.json';
import OssicularDiscontinuityCases from '../data/Ossicular_Discontinuity_cases.json';
import OtosclerosisCases from '../data/Otosclerosis_cases.json';
import { loadCaseDatabase } from './csvCaseLoader';

// CSVデータのキャッシュ
const csvCache = {};

/**
 * 疾患名から既存のJSONデータを取得（フォールバック用）
 */
function getJSONCases(key) {
  switch (key) {
    case 'AOM':
      return AOMCases || [];
    case 'OME':
      return OMECases || [];
    case 'Otosclerosis':
      return OtosclerosisCases || [];
    case 'Ossicular_Discontinuity':
      return OssicularDiscontinuityCases || [];
    default:
      return [];
  }
}

/**
 * 疾患名を正規化（JSONとCSVの命名規則を統一）
 */
function normalizeDisorderName(key) {
  const nameMap = {
    'AOM': 'AOM',
    'OME': 'OME',
    'Otosclerosis': 'OTOSCLEROSIS',
    'Ossicular_Discontinuity': 'OSSICULAR_DISCONTINUITY',
    'MUMPS': 'MUMPS',
    'SUDDEN': 'SUDDEN',
    'MENIERE': 'MENIERE',
    'NOISE': 'NOISE',
    'PRESBYCUSIS': 'PRESBYCUSIS',
    'ACOUSTIC_TRAUMA': 'ACOUSTIC_TRAUMA',
    'NORMAL': 'NORMAL'
  };
  
  return nameMap[key] || key.toUpperCase();
}

/**
 * 症例データベースから症例を取得（CSV優先、JSONフォールバック）
 * @param {string} key - 疾患名
 * @param {string} tympType - ティンパノグラム型（オプション）
 * @returns {Promise<Object|null>} 症例オブジェクト
 */
export async function pickCaseFromDatabase(key, tympType = null) {
  try {
    // まずCSVから読み込みを試みる
    const normalizedKey = normalizeDisorderName(key);
    
    // キャッシュをチェック
    if (!csvCache[normalizedKey]) {
      try {
        csvCache[normalizedKey] = await loadCaseDatabase(normalizedKey);
      } catch (error) {
        console.warn(`CSV読み込み失敗 (${normalizedKey}):`, error);
        csvCache[normalizedKey] = [];
      }
    }
    
    let arr = csvCache[normalizedKey] || [];
    
    // CSVにデータがない場合はJSONから取得
    if (arr.length === 0) {
      arr = getJSONCases(key);
    }
    
    if (!arr || arr.length === 0) {
      return null;
    }
    
    // ティンパノグラム型でフィルタリング
    if (tympType) {
      const filtered = arr.filter(c => {
        const tymp = typeof c.tympanogram === 'string' ? c.tympanogram : String(c.tympanogram || '');
        return tymp.includes(tympType);
      });
      
      if (filtered.length > 0) {
        return filtered[Math.floor(Math.random() * filtered.length)];
      }
    }
    
    // ランダムに1つ選択
    return arr[Math.floor(Math.random() * arr.length)];
  } catch (error) {
    console.error(`症例データベース読み込みエラー (${key}):`, error);
    // エラー時はJSONから取得を試みる
    const jsonCases = getJSONCases(key);
    if (jsonCases && jsonCases.length > 0) {
      return jsonCases[Math.floor(Math.random() * jsonCases.length)];
    }
    return null;
  }
}

/**
 * 同期版（既存コードとの互換性のため）
 * CSVが読み込まれていない場合はJSONから取得
 * @param {string} key - 疾患名
 * @param {string} tympType - ティンパノグラム型（オプション）
 * @returns {Object|null} 症例オブジェクト
 */
export function pickCaseFromDatabaseSync(key, tympType = null) {
  // まずキャッシュをチェック
  const normalizedKey = normalizeDisorderName(key);
  let arr = csvCache[normalizedKey];
  
  // CSVキャッシュがない場合はJSONから取得
  if (!arr || arr.length === 0) {
    arr = getJSONCases(key);
  }
  
  if (!arr || arr.length === 0) {
    return null;
  }
  
  // ティンパノグラム型でフィルタリング
  if (tympType) {
    const filtered = arr.filter(c => {
      const tymp = typeof c.tympanogram === 'string' ? c.tympanogram : String(c.tympanogram || '');
      return tymp.includes(tympType);
    });
    
    if (filtered.length > 0) {
      return filtered[Math.floor(Math.random() * filtered.length)];
    }
  }
  
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * 症例データベースを事前に読み込む（アプリ起動時など）
 * @param {Array<string>} disorderNames - 読み込む疾患名の配列
 */
export async function preloadCaseDatabases(disorderNames = ['AOM', 'OME', 'MUMPS', 'NORMAL']) {
  const normalizedNames = disorderNames.map(normalizeDisorderName);
  
  await Promise.all(
    normalizedNames.map(async (name) => {
      if (!csvCache[name]) {
        try {
          csvCache[name] = await loadCaseDatabase(name);
          console.log(`症例データベース読み込み完了: ${name} (${csvCache[name].length}件)`);
        } catch (error) {
          console.warn(`症例データベース読み込み失敗: ${name}`, error);
          csvCache[name] = [];
        }
      }
    })
  );
}

/**
 * キャッシュをクリア
 */
export function clearCaseDatabaseCache() {
  Object.keys(csvCache).forEach(key => delete csvCache[key]);
}

