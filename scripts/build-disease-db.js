const fs = require('fs');
const path = require('path');

const INPUT = "/Users/maedahidehiko/Downloads/Hearing_Disorders_40cases_cursor_long.csv";
const OUT_DIR = path.resolve(__dirname, '..', 'src', 'data');
const OUT_FILE = path.join(OUT_DIR, 'Hearing_Disorders_db.json');

function parseCSV(raw) {
  const lines = raw.split(/\r?\n/).filter(Boolean);
  const header = lines.shift().split(',');
  return lines.map(line => {
    const cols = line.split(',');
    const o = {};
    header.forEach((h, i) => o[h] = cols[i]);
    return o;
  });
}

function number(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }

function median(arr) {
  if (arr.length === 0) return null;
  const s = arr.slice().sort((a,b)=>a-b);
  const m = Math.floor(s.length/2);
  return s.length % 2 ? s[m] : (s[m-1] + s[m]) / 2;
}

function aggregate(rows) {
  const byDisease = new Map();
  for (const r of rows) {
    const d = r.Disease;
    if (!byDisease.has(d)) {
      byDisease.set(d, {
        disease: d,
        totalRows: 0,
        cases: new Set(),
        earCount: { L: 0, R: 0 },
        sides: {},
        ageGroup: {},
        tymp: {},
        freqAC: {}, // freq -> [values]
        freqBC: {}, // freq -> [values]
        complaints: new Set(),
        hpi: new Set(),
        otoscopy: new Set(),
      });
    }
    const g = byDisease.get(d);
    g.totalRows += 1;
    g.cases.add(`${r.Case}-${r.Ear}`);
    if (r.Ear === 'L' || r.Ear === 'R') g.earCount[r.Ear] += 1;
    g.sides[r.Affected_Sides] = (g.sides[r.Affected_Sides] || 0) + 1;
    g.ageGroup[r.AgeGroup] = (g.ageGroup[r.AgeGroup] || 0) + 1;
    g.tymp[r.Tympanogram] = (g.tymp[r.Tympanogram] || 0) + 1;

    const f = number(r.Freq_Hz);
    const ac = number(r.AC_dBHL);
    const bc = number(r.BC_dBHL);
    if (f != null && ac != null) {
      (g.freqAC[f] ||= []).push(ac);
    }
    if (f != null && bc != null) {
      (g.freqBC[f] ||= []).push(bc);
    }

    if (r.Chief_Complaint) g.complaints.add(r.Chief_Complaint);
    if (r.HPI) g.hpi.add(r.HPI);
    if (r.Otoscopy) g.otoscopy.add(r.Otoscopy);
  }

  // finalize
  const targetFreqs = [250, 500, 1000, 2000, 4000, 8000];
  const out = [];
  for (const g of byDisease.values()) {
    const acMed = {};
    const bcMed = {};
    for (const f of targetFreqs) {
      const mac = median(g.freqAC[f] || []);
      const mbc = median(g.freqBC[f] || []);
      if (mac != null) acMed[String(f)] = Math.round(mac);
      if (mbc != null) bcMed[String(f)] = Math.round(mbc);
    }

    // 上位のtymp・ageGroup・sidesを抽出
    const top = (obj, n=3) => Object.entries(obj)
      .sort((a,b)=>b[1]-a[1])
      .slice(0,n)
      .map(([k,v])=>({ key:k, count:v }));

    out.push({
      name: g.disease,
      stats: {
        numEars: g.cases.size, // 耳単位
        earDistribution: g.earCount,
        affectedSidesTop: top(g.sides, 3),
        ageGroupTop: top(g.ageGroup, 3),
        tympanogramTop: top(g.tymp, 3),
      },
      typicalAudiogram: {
        acMedian: acMed,
        bcMedian: bcMed,
      },
      examples: {
        chiefComplaints: Array.from(g.complaints).slice(0,8),
        hpi: Array.from(g.hpi).slice(0,8),
        otoscopy: Array.from(g.otoscopy).slice(0,8),
      }
    });
  }

  return out.sort((a,b)=>a.name.localeCompare(b.name));
}

(function main(){
  if (!fs.existsSync(INPUT)) {
    console.error('CSVが見つかりません:', INPUT);
    process.exit(1);
  }
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  const raw = fs.readFileSync(INPUT, 'utf8');
  const rows = parseCSV(raw);
  const result = aggregate(rows);
  fs.writeFileSync(OUT_FILE, JSON.stringify(result, null, 2) + '\n', 'utf8');
  console.log('Wrote disease DB:', OUT_FILE);
})();
