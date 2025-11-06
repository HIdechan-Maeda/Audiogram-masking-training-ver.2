const fs = require('fs');
const path = require('path');

// Input CSV path (Downloads)
const INPUT = "/Users/maedahidehiko/Downloads/Hearing_Disorders_40cases_cursor_long.csv";
// Output JSON paths
const OUT_DIR = path.resolve(__dirname, '..', 'src', 'data');

const DISEASE_TO_FILE = {
  AOM: 'AOM_cases.json',
  OME: 'OME_cases.json',
  Otosclerosis: 'Otosclerosis_cases.json',
  Ossicular_Discontinuity: 'Ossicular_Discontinuity_cases.json',
};

function safeReadJSON(fp) {
  if (!fs.existsSync(fp)) return [];
  try {
    const t = fs.readFileSync(fp, 'utf8');
    const j = JSON.parse(t);
    return Array.isArray(j) ? j : [];
  } catch (e) {
    return [];
  }
}

function writeJSON(fp, arr) {
  const txt = JSON.stringify(arr, null, 2) + '\n';
  fs.writeFileSync(fp, txt, 'utf8');
}

function parseCSV(raw) {
  const lines = raw.split(/\r?\n/).filter(Boolean);
  const header = lines.shift().split(',');
  const rows = lines.map(line => {
    // ただのカンマ区切り（日本語の句読点は影響なし）
    const cols = line.split(',');
    const obj = {};
    header.forEach((h, i) => obj[h] = cols[i]);
    return obj;
  });
  return rows;
}

function numberOrNull(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function aggregateByCase(rows) {
  // key: Disease|Case|Ear
  const map = new Map();
  for (const r of rows) {
    const disease = r.Disease;
    const caseId = r.Case;
    const ear = r.Ear; // L or R
    const key = `${disease}|${caseId}|${ear}`;
    if (!map.has(key)) {
      map.set(key, {
        Disease: disease,
        Case: caseId,
        Ear: ear,
        Tympanogram: r.Tympanogram,
        Chief_Complaint: r.Chief_Complaint,
        HPI: r.HPI,
        Otoscopy: r.Otoscopy,
        FreqToAC: {},
        FreqToBC: {},
      });
    }
    const obj = map.get(key);
    const freq = numberOrNull(r.Freq_Hz);
    if (freq != null) {
      const ac = numberOrNull(r.AC_dBHL);
      const bc = numberOrNull(r.BC_dBHL);
      if (ac != null) obj.FreqToAC[freq] = ac;
      if (bc != null) obj.FreqToBC[freq] = bc;
    }
    // 代表値更新（最新行優先）
    obj.Tympanogram = r.Tympanogram || obj.Tympanogram;
    obj.Chief_Complaint = r.Chief_Complaint || obj.Chief_Complaint;
    obj.HPI = r.HPI || obj.HPI;
    obj.Otoscopy = r.Otoscopy || obj.Otoscopy;
  }
  return Array.from(map.values());
}

function freqMapToAc(acMap) {
  // 既存JSONのキーは {"250": 25, ...} の形
  const targetFreqs = [250, 500, 1000, 2000, 4000, 8000];
  const out = {};
  for (const f of targetFreqs) {
    if (acMap[f] != null) out[String(f)] = acMap[f];
  }
  return out;
}

function bcSummary(bcMap) {
  const vals = Object.values(bcMap).filter(v => Number.isFinite(v));
  if (vals.length === 0) return 10; // デフォルト（従来JSONに合わせる）
  // 中央値
  const s = vals.slice().sort((a,b)=>a-b);
  const mid = Math.floor(s.length/2);
  return s.length % 2 ? s[mid] : Math.round((s[mid-1]+s[mid])/2);
}

function toJsonEntry(agg, nextId, disease) {
  const base = {
    caseId: nextId,
    chiefComplaint: agg.Chief_Complaint || '',
    hpi: agg.HPI || '',
    otoscopy: agg.Otoscopy || '',
    tympanogram: agg.Tympanogram || '',
    ac: freqMapToAc(agg.FreqToAC),
    bc_all: bcSummary(agg.FreqToBC),
  };
  if (disease === 'Ossicular_Discontinuity') {
    base.unilateral = true;
    base.affectedSide = agg.Ear === 'R' ? 'right' : 'left';
  }
  return base;
}

(function main(){
  if (!fs.existsSync(INPUT)) {
    console.error('CSVが見つかりません:', INPUT);
    process.exit(1);
  }
  const raw = fs.readFileSync(INPUT, 'utf8');
  const rows = parseCSV(raw);
  const aggs = aggregateByCase(rows);

  // 疾患ごとに既存JSONへ追記
  for (const [disease, fileName] of Object.entries(DISEASE_TO_FILE)) {
    const fp = path.join(OUT_DIR, fileName);
    const current = safeReadJSON(fp);
    let nextId = current.reduce((m, x) => Math.max(m, Number(x.caseId)||0), 0) + 1;
    const addList = aggs.filter(a => a.Disease === disease).map(a => toJsonEntry(a, nextId++, disease));
    if (addList.length === 0) continue;
    const merged = current.concat(addList);
    writeJSON(fp, merged);
    console.log(`${fileName}: +${addList.length} 症例を追加しました`);
  }
})();
