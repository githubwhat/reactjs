// 미국 재무부 일별 명목(Par) / 실질 수익률곡선 XML 피드
import { XMLParser } from 'fast-xml-parser';
import { request, sleep } from './lib/http.js';

const FEEDS = {
  treasury: { data: 'daily_treasury_yield_curve', firstYear: 1990 },
  'treasury-real': { data: 'daily_treasury_real_yield_curve', firstYear: 2003 },
};

const parser = new XMLParser({ ignoreAttributes: true, removeNSPrefix: true, parseTagValue: true });

function feedUrl(data, year) {
  return `https://home.treasury.gov/resource-center/data-chart-center/interest-rates/pages/xml?data=${data}&field_tdr_date_value=${year}`;
}

export function parseTreasuryXml(xml) {
  const doc = parser.parse(xml);
  let entries = doc?.feed?.entry ?? [];
  if (!Array.isArray(entries)) entries = [entries];
  return entries.map((e) => e.content.properties);
}

// src: 'treasury' | 'treasury-real'
export async function fetchTreasury(src, inds, { full }) {
  const { data, firstYear } = FEEDS[src];
  const thisYear = new Date().getUTCFullYear();
  const years = [];
  for (let y = full ? firstYear : thisYear - 1; y <= thisYear; y++) years.push(y);

  const out = Object.fromEntries(inds.map((i) => [i.id, []]));
  for (const y of years) {
    const rows = parseTreasuryXml(await request(feedUrl(data, y)));
    for (const row of rows) {
      const date = String(row.NEW_DATE).slice(0, 10);
      for (const ind of inds) {
        const v = row[ind.ref];
        if (typeof v === 'number') out[ind.id].push([date, v]);
      }
    }
    await sleep(300);
  }
  return out;
}
