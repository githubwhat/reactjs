// NBER 경기순환 기준일 → 월별 경기침체 0/1 지표 (정점 다음 달 ~ 저점 달 = 1, FRED USREC와 같은 정의)
import { request } from './lib/http.js';
import { monthStart } from './lib/dates.js';

const URL = 'https://data.nber.org/cycles/business_cycle_dates.json';

export function buildUsrec(cycles, now = new Date()) {
  const ym = (iso) => {
    const [y, m] = iso.split('-').map(Number);
    return y * 12 + (m - 1);
  };
  const ranges = cycles
    .filter((c) => c.peak)
    .map((c) => [ym(c.peak) + 1, c.trough ? ym(c.trough) : Infinity]);
  const first = Math.min(...cycles.filter((c) => c.trough).map((c) => ym(c.trough)));
  const last = now.getUTCFullYear() * 12 + now.getUTCMonth();
  const out = [];
  for (let k = first; k <= last; k++) {
    const inRec = ranges.some(([a, b]) => k >= a && k <= b);
    out.push([monthStart(Math.floor(k / 12), (k % 12) + 1), inRec ? 1 : 0]);
  }
  return out;
}

export async function fetchNber(inds) {
  const cycles = await request(URL, { as: 'json' });
  if (!Array.isArray(cycles) || !cycles.length) throw new Error('NBER 응답 형식 오류');
  const series = buildUsrec(cycles);
  return Object.fromEntries(inds.map((i) => [i.id, series]));
}
