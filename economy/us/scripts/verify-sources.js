// 각 원천에 '등록 없이' 실제 요청이 성공하고 날짜·수치를 파싱할 수 있는지 가볍게 점검한다.
// 결과: reports/source-verification.json. 일부 실패해도 수집은 계속 진행(이전 데이터 보존)하며,
// 전부 실패한 경우에만 종료 코드 1.
import path from 'node:path';
import { unzipSync } from 'fflate';
import { REPORTS_DIR, writeJson } from './lib/store.js';
import { request } from './lib/http.js';
import { parseTreasuryXml } from './fetch-treasury.js';
import { parseBls } from './fetch-bls.js';
import { parseDol } from './fetch-dol.js';
import { extractSeries } from './fetch-fed.js';
import { extractCensus, parseSections } from './fetch-census.js';
import { parseEiaDaily } from './fetch-eia.js';
import { buildUsrec } from './fetch-nber.js';

const y = new Date().getUTCFullYear();
const last = (arr) => arr[arr.length - 1];

const CHECKS = {
  treasury: async () => {
    const rows = parseTreasuryXml(await request(`https://home.treasury.gov/resource-center/data-chart-center/interest-rates/pages/xml?data=daily_treasury_yield_curve&field_tdr_date_value=${y}`));
    const r = last(rows);
    return [String(r.NEW_DATE).slice(0, 10), r.BC_10YEAR, '10년 금리'];
  },
  nyfed: async () => {
    const j = await request('https://markets.newyorkfed.org/api/rates/secured/sofr/last/1.json', { as: 'json' });
    return [j.refRates[0].effectiveDate, j.refRates[0].percentRate, 'SOFR'];
  },
  bls: async () => {
    const json = await request('https://api.bls.gov/publicAPI/v1/timeseries/data/LNS14000000', { as: 'json' });
    const s = parseBls(json).LNS14000000;
    return [last(s)[0], last(s)[1], '실업률'];
  },
  dol: async () => {
    const body = new URLSearchParams({ level: 'us', final_yr: String(y + 1), strtdate: String(y), enddate: String(y), filetype: 'xml', submit: 'Submit' });
    const { initial } = parseDol(await request('https://oui.doleta.gov/unemploy/wkclaims/report.asp', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString() }));
    return [last(initial)[0], last(initial)[1], '신규 실업수당 청구'];
  },
  fed: async () => {
    const files = unzipSync(await request('https://www.federalreserve.gov/datadownload/Output.aspx?rel=SLOOS&filetype=zip', { as: 'buffer' }));
    const xml = new TextDecoder().decode(files[Object.keys(files).find((f) => f.endsWith('_data.xml'))]);
    const s = extractSeries(xml, 'SUBLPDCILS_N.Q');
    return [last(s.obs)[0], last(s.obs)[1], 'SLOOS 대출심사'];
  },
  census: async () => {
    const files = unzipSync(await request('https://www.census.gov/econ_getzippedfile/?programCode=FTD', { as: 'buffer' }));
    const sections = parseSections(new TextDecoder().decode(files[Object.keys(files).find((f) => f.endsWith('.csv'))]));
    const s = extractCensus(sections, { cat: 'BOPGS', dt: 'BAL', adj: 1 });
    return [last(s)[0], last(s)[1], '무역수지'];
  },
  fiscal: async () => {
    const j = await request('https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v2/accounting/od/debt_to_penny?sort=-record_date&page%5Bsize%5D=1', { as: 'json' });
    return [j.data[0].record_date, Number(j.data[0].tot_pub_debt_out_amt), '총부채'];
  },
  eia: async () => {
    const s = parseEiaDaily(await request('https://www.eia.gov/dnav/ng/hist/rngwhhdD.htm'));
    return [last(s)[0], last(s)[1], '헨리허브 가스'];
  },
  nber: async () => {
    const s = buildUsrec(await request('https://data.nber.org/cycles/business_cycle_dates.json', { as: 'json' }));
    return [last(s)[0], last(s)[1], '경기침체 0/1'];
  },
};

const results = {};
for (const [name, fn] of Object.entries(CHECKS)) {
  const t0 = Date.now();
  try {
    const [date, value, label] = await fn();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(value)) throw new Error(`파싱 결과 이상: ${date} ${value}`);
    results[name] = { ok: true, sample: { label, date, value }, ms: Date.now() - t0, registration: false };
    console.log(`[OK  ] ${name.padEnd(9)} ${label} ${date} = ${value}`);
  } catch (err) {
    results[name] = { ok: false, error: err.message, ms: Date.now() - t0 };
    console.log(`[FAIL] ${name.padEnd(9)} ${err.message}`);
  }
}

writeJson(path.join(REPORTS_DIR, 'source-verification.json'), { checkedAt: new Date().toISOString(), results }, true);
const okCount = Object.values(results).filter((r) => r.ok).length;
console.log(`원천 점검: ${okCount}/${Object.keys(results).length} 성공`);
if (okCount === 0) process.exit(1);
