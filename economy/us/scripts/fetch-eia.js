// EIA 현물가격 이력 표(HTML). EIA API v2는 키가 필요하므로 공개 이력 페이지를 읽는다.
import { request, sleep } from './lib/http.js';
import { addDays, monthNum, ymd } from './lib/dates.js';

// 예: PET/RWTC → https://www.eia.gov/dnav/pet/hist/rwtcD.htm
const pageUrl = (ref) => {
  const [n, s] = ref.split('/');
  return `https://www.eia.gov/dnav/${n.toLowerCase()}/hist/${s.toLowerCase()}D.htm`;
};

// 각 행: "1986 Jan- 6 to Jan-10" + 월~금 5칸
export function parseEiaDaily(html) {
  const out = [];
  const rowRe = /<td class='B6'>(?:&nbsp;)*\s*(\d{4}) ([A-Z][a-z]{2})-\s*(\d{1,2}) to [^<]*<\/td>((?:\s*<td class='B3'>[^<]*<\/td>){5})/g;
  for (const m of html.matchAll(rowRe)) {
    const monday = ymd(Number(m[1]), monthNum(m[2]), Number(m[3]));
    const cells = [...m[4].matchAll(/<td class='B3'>([^<]*)<\/td>/g)].map((c) => c[1].trim());
    cells.forEach((c, i) => {
      const v = Number(c);
      if (c !== '' && Number.isFinite(v)) out.push([addDays(monday, i), v]);
    });
  }
  return out;
}

export async function fetchEia(inds) {
  const out = {};
  for (const ind of inds) {
    const rows = parseEiaDaily(await request(pageUrl(ind.ref)));
    if (!rows.length) throw new Error(`EIA ${ind.ref}: 표를 해석하지 못함`);
    out[ind.id] = rows;
    await sleep(800);
  }
  return out;
}
