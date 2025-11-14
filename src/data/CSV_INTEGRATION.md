# CSV症例データベース統合ガイド

## 概要

CSVファイルで症例データを管理できるようになりました。既存のJSONファイルと互換性があり、CSVファイルがない場合は自動的にJSONファイルから読み込みます。

## ファイル構成

```
public/data/          # CSVファイルを配置
  ├── NORMAL.csv
  ├── AOM.csv
  ├── OME.csv
  ├── MUMPS.csv
  └── ...

src/utils/
  ├── csvCaseLoader.js    # CSV読み込みユーティリティ
  └── caseDatabase.js      # 統合データベースアクセス
```

## 既存コードへの統合方法

### 方法1: 非同期版（推奨）

```javascript
import { pickCaseFromDatabase } from './utils/caseDatabase';

// 既存のpickCaseFromDB関数を置き換え
const pickCaseFromDB = async (key) => {
  const dbCase = await pickCaseFromDatabase(key, tympType);
  return dbCase;
};

// 使用例
const dbCase = await pickCaseFromDB('AOM');
if (dbCase) {
  chiefComplaint = dbCase.chiefComplaint;
  history = dbCase.hpi;
}
```

### 方法2: 同期版（既存コードとの互換性）

```javascript
import { pickCaseFromDatabaseSync } from './utils/caseDatabase';

// 既存のpickCaseFromDB関数を置き換え
const pickCaseFromDB = (key) => {
  return pickCaseFromDatabaseSync(key, tympType);
};

// 使用例（既存コードと同じ）
const dbCase = pickCaseFromDB('AOM');
if (dbCase) {
  chiefComplaint = dbCase.chiefComplaint;
  history = dbCase.hpi;
}
```

### 方法3: 事前読み込み（パフォーマンス最適化）

アプリ起動時にCSVファイルを事前に読み込むことで、後続のアクセスを高速化できます。

```javascript
import { preloadCaseDatabases } from './utils/caseDatabase';

// コンポーネントのuseEffectで実行
useEffect(() => {
  preloadCaseDatabases(['AOM', 'OME', 'MUMPS', 'NORMAL']);
}, []);
```

## AudiogramMaskingMVP.jsへの統合例

既存の`pickCaseFromDB`関数を以下のように置き換えます：

```javascript
// インポートを追加
import { pickCaseFromDatabaseSync } from './utils/caseDatabase';

// 既存のpickCaseFromDB関数を置き換え
const pickCaseFromDB = (key) => {
  return pickCaseFromDatabaseSync(key, tympType);
};
```

## CSVファイルの作成手順

1. `public/data/`フォルダにCSVファイルを作成
2. ファイル名は疾患名（例: `AOM.csv`）
3. 必須カラムを含める：
   - `caseId`, `chiefComplaint`, `hpi`, `otoscopy`, `tympanogram`
   - `ac_125`, `ac_250`, `ac_500`, `ac_1000`, `ac_2000`, `ac_4000`, `ac_8000`
   - `bc_all`
4. UTF-8エンコーディングで保存

## メリット

- ✅ ExcelやGoogleスプレッドシートで編集可能
- ✅ バージョン管理がしやすい（CSVはテキスト形式）
- ✅ 非エンジニアでも編集可能
- ✅ 既存のJSONファイルとの互換性を保持
- ✅ CSVがない場合は自動的にJSONから読み込み

## 注意事項

- CSVファイルは`public/data/`フォルダに配置してください
- UTF-8エンコーディングで保存してください
- カンマを含む文字列はダブルクォートで囲んでください
- 空欄は空のままにしてください（nullとして扱われます）


