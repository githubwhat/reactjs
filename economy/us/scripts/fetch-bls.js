// BLS Public Data API v1 (등록 불필요: 일 25회, 요청당 25개 시리즈, 최대 10년 구간)
import { request, sleep } from './lib/http.js';
import { monthStart, quarterStart } from './lib/dates.js';

const URL = 'https://api.bls.gov/publicAPI/v1/timeseries/data/';
const MAX_SERIES = 25;

function toDate(year, period) {
  if (/^M(0[1-9]|1[0-2])$/.test(period)) return monthStart(Number(year), Number(period.slice(1)));
  if (/^Q0[1-4]$/.test(period)) return quarterStart(Number(year), Number(period.slice(2)));
  return null; // M13(연평균) 등은 제외
}

export function parseBls(json) {
  if (json.status !== 'REQUEST_SUCCEEDED') {
    throw new Error(`BLS ${json.status}: ${(json.message || []).join(' / ')}`);
  }
  const out = {};
  for (const s of json.Results?.series || []) {
    out[s.seriesID] = s.data
      .map((o) => [toDate(o.year, o.period), Number(o.value)])
      .filter(([d, v]) => d && Number.isFinite(v))
      .sort((a, b) => (a[0] < b[0] ? -1 : 1)); // 응답은 최신순
  }
  return out;
}

// 최초 구축: 10년 단위 3구간(약 30년). 매일: 최근 3년(개정 반영) — 하루 1회 요청이면 충분
function windows(full) {
  const y = new Date().getUTCFullYear();
  if (!full) return [[y - 2, y]];
  return [[y - 9, y], [y - 19, y - 10], [y - 29, y - 20]];
}

export async function fetchBls(inds, { full }) {
  const ids = inds.map((i) => i.ref);
  const bySeries = Object.fromEntries(ids.map((id) => [id, []]));

  for (let k = 0; k < ids.length; k += MAX_SERIES) {
    const chunk = ids.slice(k, k + MAX_SERIES);
    for (const [start, end] of windows(full)) {
      const json = await request(URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seriesid: chunk, startyear: String(start), endyear: String(end) }),
        as: 'json',
      });
      const parsed = parseBls(json);
      for (const id of chunk) bySeries[id].push(...(parsed[id] || []));
      await sleep(1500);
    }
  }
  return Object.fromEntries(inds.map((i) => [i.id, bySeries[i.ref]]));
}
