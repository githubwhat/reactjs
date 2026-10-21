// Census Business & Industry Time Series — 보고서별 전체 데이터 zip (등록 불필요)
// ※ Census Data API(api.census.gov)는 키가 필수가 되어 사용하지 않는다.
import { unzipSync } from 'fflate';
import Papa from 'papaparse';
import { request, sleep } from './lib/http.js';
import { monthNum, monthStart, quarterStart } from './lib/dates.js';

const zipUrl = (prog) => `https://www.census.gov/econ_getzippedfile/?programCode=${prog}`;
const SECTIONS = new Set(['CATEGORIES', 'DATA TYPES', 'ERROR TYPES', 'GEO LEVELS', 'TIME PERIODS', 'NOTES', 'DATA UPDATED ON', 'DATA']);

// 파일은 "섹션 제목 줄 + CSV 표" 묶음이 이어진 구조
export function parseSections(text) {
  const sections = {};
  let name = null;
  let lines = [];
  const flush = () => {
    if (name && lines.length) sections[name] = Papa.parse(lines.join('\n'), { header: true, skipEmptyLines: true }).data;
  };
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (SECTIONS.has(t)) {
      flush();
      name = t;
      lines = [];
    } else if (t) {
      lines.push(line);
    }
  }
  flush();
  return sections;
}

function periodToDate(name) {
  let m = name.match(/^([A-Z][a-z]{2})-(\d{4})$/);
  if (m) return monthStart(Number(m[2]), monthNum(m[1]));
  m = name.match(/^Q(\d)-(\d{4})$/);
  if (m) return quarterStart(Number(m[2]), Number(m[1]));
  return null;
}

export function extractCensus(sections, { cat, dt, adj }) {
  const catIdx = sections.CATEGORIES.find((r) => r.cat_code === cat)?.cat_idx;
  const dtIdx = sections['DATA TYPES'].find((r) => r.dt_code === dt)?.dt_idx;
  const geoIdx = sections['GEO LEVELS'].find((r) => r.geo_code === 'US')?.geo_idx;
  if (!catIdx || !dtIdx || !geoIdx) throw new Error(`코드 없음 cat=${cat} dt=${dt}`);
  const periods = new Map(sections['TIME PERIODS'].map((r) => [r.per_idx, periodToDate(r.per_name)]));
  return sections.DATA.filter(
    (r) =>
      r.cat_idx === catIdx &&
      r.dt_idx === dtIdx &&
      r.geo_idx === geoIdx &&
      r.is_adj === String(adj) &&
      (r.et_idx === undefined || r.et_idx === '0'),
  )
    .map((r) => [periods.get(r.per_idx), Number(r.val)])
    .filter(([d, v]) => d && Number.isFinite(v));
}

export async function fetchCensus(inds) {
  const byProg = new Map();
  for (const ind of inds) {
    if (!byProg.has(ind.ref.prog)) byProg.set(ind.ref.prog, []);
    byProg.get(ind.ref.prog).push(ind);
  }
  const out = {};
  const errors = [];
  for (const [prog, list] of byProg) {
    try {
      const files = unzipSync(await request(zipUrl(prog), { as: 'buffer' }));
      const csvName = Object.keys(files).find((f) => f.endsWith('.csv'));
      const sections = parseSections(new TextDecoder().decode(files[csvName]));
      for (const ind of list) out[ind.id] = extractCensus(sections, ind.ref);
    } catch (err) {
      errors.push(`${prog}: ${err.message}`);
    }
    await sleep(800);
  }
  if (errors.length) out._errors = errors;
  return out;
}
