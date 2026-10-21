// 연준 이사회 Data Download Program — 릴리스 전체 패키지(zip 안의 SDMX XML)
// H.4.1 XML은 압축 해제 시 100MB를 넘으므로 DOM 파서 대신 필요한 시리즈 블록만 정규식으로 잘라 읽는다.
import { unzipSync } from 'fflate';
import { request, sleep } from './lib/http.js';
import { periodStart } from './lib/dates.js';
import { round } from './lib/store.js';

const zipUrl = (rel) => `https://www.federalreserve.gov/datadownload/Output.aspx?rel=${rel}&filetype=zip`;

// SDMX FREQ 코드: 9=영업일, 19=주(수요일), 129=월, 162=분기, 203=연
const FREQ = { 129: 'monthly', 162: 'quarterly' };

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function extractSeries(xml, name) {
  const start = xml.search(new RegExp(`<kf:Series [^>]*SERIES_NAME="${escapeRe(name)}"`));
  if (start < 0) return null;
  const end = xml.indexOf('</kf:Series>', start);
  const block = xml.slice(start, end);
  const head = block.slice(0, block.indexOf('>'));
  const mult = Number(head.match(/UNIT_MULT="([^"]+)"/)?.[1] ?? 1);
  const freq = FREQ[head.match(/FREQ="(\d+)"/)?.[1]] || 'daily';
  const obs = [];
  // OBS_STATUS가 A(정상)인 값만 사용 — ND/NA/NC는 -9999 같은 '자료 없음' 표시값
  for (const m of block.matchAll(/<frb:Obs OBS_STATUS="([A-Z]+)" OBS_VALUE="([^"]*)" TIME_PERIOD="([^"]*)"/g)) {
    const v = Number(m[2]);
    if (m[1] === 'A' && m[2] !== '' && Number.isFinite(v)) obs.push([periodStart(m[3], freq), v]);
  }
  return { mult, obs };
}

export async function fetchFed(inds) {
  const byRel = new Map();
  for (const ind of inds) {
    if (!byRel.has(ind.ref.rel)) byRel.set(ind.ref.rel, []);
    byRel.get(ind.ref.rel).push(ind);
  }

  const out = {};
  const errors = [];
  for (const [rel, list] of byRel) {
    try {
      const files = unzipSync(await request(zipUrl(rel), { as: 'buffer', timeout: 180000 }));
      const dataName = Object.keys(files).find((f) => f.endsWith('_data.xml'));
      if (!dataName) throw new Error(`${rel}: zip에 데이터 XML 없음`);
      const xml = new TextDecoder().decode(files[dataName]);
      for (const ind of list) {
        const s = extractSeries(xml, ind.ref.series);
        if (!s) throw new Error(`${rel}: 시리즈 ${ind.ref.series} 없음`);
        // 원 단위(UNIT_MULT)를 지표 표시 단위(to)로 환산
        const scale = ind.ref.to ? s.mult / ind.ref.to : 1;
        out[ind.id] = s.obs.map(([d, v]) => [d, round(v * scale, 4)]);
      }
    } catch (err) {
      errors.push(`${rel}: ${err.message}`);
    }
    await sleep(500);
  }
  if (errors.length) out._errors = errors;
  return out;
}
