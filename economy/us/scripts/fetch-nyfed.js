// 뉴욕 연준 Markets Data API (EFFR·목표범위·SOFR·역레포)
import { request, sleep } from './lib/http.js';
import { addDays, today } from './lib/dates.js';
import { round } from './lib/store.js';

const BASE = 'https://markets.newyorkfed.org/api';
const FIRST = { effr: '2000-07-03', sofr: '2018-04-02', rrp: '2013-09-23' };

async function rates(path, start) {
  const j = await request(`${BASE}/rates/${path}/search.json?startDate=${start}&endDate=${today()}`, { as: 'json' });
  return j.refRates || [];
}

export async function fetchNyfed(inds, { full }) {
  const want = new Set(inds.map((i) => i.ref));
  const recent = addDays(today(), -60);
  const series = { effr: [], 'effr-upper': [], 'effr-lower': [], sofr: [], rrp: [] };

  if (want.has('effr') || want.has('effr-upper') || want.has('effr-lower')) {
    for (const r of await rates('unsecured/effr', full ? FIRST.effr : recent)) {
      const d = r.effectiveDate;
      if (typeof r.percentRate === 'number') series.effr.push([d, r.percentRate]);
      // 목표'범위'(상단·하단)는 2008-12-16 범위제 도입 이후에만 존재 — 그 전 단일 목표금리는 넣지 않음
      if (typeof r.targetRateTo === 'number' && typeof r.targetRateFrom === 'number') {
        series['effr-upper'].push([d, r.targetRateTo]);
        series['effr-lower'].push([d, r.targetRateFrom]);
      }
    }
    await sleep(500);
  }

  if (want.has('sofr')) {
    for (const r of await rates('secured/sofr', full ? FIRST.sofr : recent)) {
      if (typeof r.percentRate === 'number') series.sofr.push([r.effectiveDate, r.percentRate]);
    }
    await sleep(500);
  }

  if (want.has('rrp')) {
    const start = full ? FIRST.rrp : recent;
    const j = await request(`${BASE}/rp/reverserepo/propositions/search.json?startDate=${start}&endDate=${today()}`, { as: 'json' });
    // 같은 날 여러 번 실시된 운영은 합산 (달러 → 십억 달러)
    const byDate = new Map();
    for (const op of j.repo?.operations || []) {
      if (op.operationType !== 'Reverse Repo' || typeof op.totalAmtAccepted !== 'number') continue;
      byDate.set(op.operationDate, (byDate.get(op.operationDate) || 0) + op.totalAmtAccepted);
    }
    series.rrp = [...byDate.entries()].map(([d, v]) => [d, round(v / 1e9, 3)]);
  }

  return Object.fromEntries(inds.map((i) => [i.id, series[i.ref]]));
}
