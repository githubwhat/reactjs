// 미국 노동부 주간 실업수당 청구 (전국, 계절조정) — r539cy XML 보고서
import { XMLParser } from 'fast-xml-parser';
import { request } from './lib/http.js';

const URL = 'https://oui.doleta.gov/unemploy/wkclaims/report.asp';
const parser = new XMLParser({ ignoreAttributes: true, parseTagValue: false });

const num = (s) => {
  const v = Number(String(s ?? '').replace(/,/g, '').trim());
  return String(s ?? '').trim() && Number.isFinite(v) ? v : null;
};

export function parseDol(xml) {
  let weeks = parser.parse(xml)?.r539cyNational?.week ?? [];
  if (!Array.isArray(weeks)) weeks = [weeks];
  const initial = [];
  const continued = [];
  for (const w of weeks) {
    const [m, d, y] = String(w.weekEnded).split('/');
    const date = `${y}-${m}-${d}`;
    const ic = num(w.InitialClaims?.SA);
    const cc = num(w.ContinuedClaims?.SA);
    if (ic !== null) initial.push([date, ic]);
    if (cc !== null) continued.push([date, cc]);
  }
  return { initial, continued };
}

export async function fetchDol(inds, { full }) {
  const y = new Date().getUTCFullYear();
  const body = new URLSearchParams({
    level: 'us',
    final_yr: String(y + 1),
    strtdate: String(full ? 1967 : y - 1),
    enddate: String(y),
    filetype: 'xml',
    submit: 'Submit',
  });
  const xml = await request(URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
    timeout: 180000,
  });
  const parsed = parseDol(xml);
  return Object.fromEntries(inds.map((i) => [i.id, parsed[i.ref]]));
}
