// 재무부 Fiscal Data REST API (등록 불필요)
import { request, sleep } from './lib/http.js';
import { quarterStart, today } from './lib/dates.js';
import { round } from './lib/store.js';

const BASE = 'https://api.fiscaldata.treasury.gov/services/api/fiscal_service';

async function allPages(endpoint, params) {
  const rows = [];
  for (let page = 1; ; page++) {
    const qs = new URLSearchParams({ ...params, 'page[size]': '10000', 'page[number]': String(page) });
    const j = await request(`${BASE}/${endpoint}?${qs}`, { as: 'json' });
    rows.push(...j.data);
    if (page >= (j.meta?.['total-pages'] ?? 1)) break;
    await sleep(300);
  }
  return rows;
}

// 연방정부 총부채: 일별 Debt to the Penny 중 '끝난 분기'의 마지막 관측값 (FRED GFDEBTN과 같은 분기말 기준)
async function debtQuarterly() {
  const rows = await allPages('v2/accounting/od/debt_to_penny', {
    fields: 'record_date,tot_pub_debt_out_amt',
    sort: 'record_date',
  });
  const now = today();
  const lastOfQuarter = new Map();
  for (const r of rows) {
    const [y, m] = r.record_date.split('-').map(Number);
    const q = Math.ceil(m / 3);
    const qEnd = new Date(Date.UTC(y, q * 3, 0)).toISOString().slice(0, 10);
    if (qEnd >= now) continue; // 진행 중인 분기는 제외
    lastOfQuarter.set(quarterStart(y, q), round(Number(r.tot_pub_debt_out_amt) / 1e9, 3));
  }
  return [...lastOfQuarter.entries()];
}

// 회계연도 재정수지: MTS 표1에서 9월(회계연도 말) 보고서의 해당 FY '누계' 행. 적자(deficit)는 음수로 표시.
async function fyDeficit() {
  const rows = await allPages('v1/accounting/mts/mts_table_1', {
    fields: 'record_date,classification_id,parent_id,classification_desc,current_month_dfct_sur_amt,record_fiscal_year',
    filter: 'record_calendar_month:eq:09',
    sort: 'record_date',
  });
  const out = [];
  const byDate = Map.groupBy ? Map.groupBy(rows, (r) => r.record_date) : groupBy(rows);
  for (const [date, list] of byDate) {
    const fy = date.slice(0, 4);
    const header = list.find((r) => r.classification_desc === `FY ${fy}`);
    const ytd = header && list.find((r) => r.classification_desc === 'Year-to-Date' && r.parent_id === header.classification_id);
    const v = Number(ytd?.current_month_dfct_sur_amt);
    if (ytd && Number.isFinite(v)) out.push([date, round(-v / 1e9, 3)]);
  }
  return out;
}

function groupBy(rows) {
  const m = new Map();
  for (const r of rows) {
    if (!m.has(r.record_date)) m.set(r.record_date, []);
    m.get(r.record_date).push(r);
  }
  return m;
}

export async function fetchFiscal(inds) {
  const out = {};
  for (const ind of inds) {
    out[ind.id] = ind.ref === 'debt-quarterly' ? await debtQuarterly() : await fyDeficit();
  }
  return out;
}
