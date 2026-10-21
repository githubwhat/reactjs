import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { evaluateRisk, metric, valueYearAgo } from '../lib/risk.js';
import { mergeHistory } from '../lib/store.js';
import { derive } from '../derive.js';
import { buildUsrec } from '../fetch-nber.js';
import { parseEiaDaily } from '../fetch-eia.js';

const rules = JSON.parse(readFileSync(new URL('../../config/risk-rules.json', import.meta.url))).rules;

// 테스트용 시계열 생성기 (실데이터가 아닌 규칙 검증용 입력)
const daily = (values, start = '2025-01-01') =>
  values.map((v, i) => {
    const d = new Date(`${start}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    return [d.toISOString().slice(0, 10), v];
  });
const monthly = (values, startYear = 2020) =>
  values.map((v, i) => [`${startYear + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}-01`, v]);

test('장단기 금리차: 역전이면 위험', () => {
  const r = evaluateRisk(rules.t10y2y, daily(Array(300).fill(0.5).concat([-0.2])), 'daily');
  assert.equal(r.risk, 'danger');
  assert.match(r.reason, /역전/);
});

test('장단기 금리차: 최근 1년 내 역전 후 해소되면 주의', () => {
  const vals = Array(100).fill(-0.3).concat(Array(150).fill(0.4));
  assert.equal(evaluateRisk(rules.t10y2y, daily(vals), 'daily').risk, 'caution');
});

test('장단기 금리차: 충분히 양수이면 정상', () => {
  assert.equal(evaluateRisk(rules.t10y2y, daily(Array(300).fill(1.2)), 'daily').risk, 'normal');
});

test('실업률: 삼의 법칙 0.5%p 이상이면 위험', () => {
  const vals = Array(12).fill(3.5).concat([3.6, 3.8, 4.0, 4.2, 4.3]);
  const h = monthly(vals);
  assert.ok(metric('sahm', h, 'monthly') >= 0.5);
  assert.equal(evaluateRisk(rules.unrate, h, 'monthly').risk, 'danger');
});

test('실업률: 단순히 오른 값 하나로는 위험이 아님 (지속 상승 여부 판단)', () => {
  const vals = Array(16).fill(4.0).concat([4.1]);
  assert.equal(evaluateRisk(rules.unrate, monthly(vals), 'monthly').risk, 'normal');
});

test('CPI: 전년 대비 3% 이상이면 주의, 5% 이상이면 위험', () => {
  const mk = (rate) => monthly(Array.from({ length: 13 }, (_, i) => 100 * (1 + rate) ** (i / 12)));
  assert.equal(evaluateRisk(rules.cpiaucsl, mk(0.02), 'monthly').risk, 'normal');
  assert.equal(evaluateRisk(rules.cpiaucsl, mk(0.035), 'monthly').risk, 'caution');
  assert.equal(evaluateRisk(rules.cpiaucsl, mk(0.06), 'monthly').risk, 'danger');
});

test('관측값이 부족하면 판단불가', () => {
  const r = evaluateRisk(rules.cpiaucsl, monthly([100, 101]), 'monthly');
  assert.equal(r.risk, 'unknown');
});

test('규칙이 없는 지표는 판단불가 (억지로 깃발을 붙이지 않음)', () => {
  assert.equal(evaluateRisk(undefined, daily([1, 2, 3]), 'daily').risk, 'unknown');
});

test('다른 지표 참조: SOFR가 목표 상단을 넘으면 주의', () => {
  const h = daily([4.3, 4.6]);
  assert.equal(evaluateRisk(rules.sofr, h, 'daily', { dfedtaru: 4.5 }).risk, 'caution');
  assert.equal(evaluateRisk(rules.sofr, h, 'daily', { dfedtaru: 4.75 }).risk, 'normal');
});

test('신규 실업수당: 1년 저점 대비 급증하면 위험', () => {
  const vals = Array(60).fill(200000).concat([260000, 270000, 280000, 290000]);
  assert.equal(evaluateRisk(rules.icsa, daily(vals), 'weekly').risk, 'danger');
});

test('전년 대비: 월간은 같은 달, 해당 달이 없으면 null', () => {
  const h = monthly([100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 120]);
  assert.equal(valueYearAgo(h, 'monthly'), 100);
  assert.equal(valueYearAgo(h.slice(1), 'monthly'), null);
});

test('이력 병합: 개정값 반영, 날짜 중복 없음, 재실행해도 동일', () => {
  const old = [['2026-01-01', 1], ['2026-02-01', 2]];
  const { history, changed } = mergeHistory(old, [['2026-02-01', 2.5], ['2026-03-01', 3]]);
  assert.deepEqual(history, [['2026-01-01', 1], ['2026-02-01', 2.5], ['2026-03-01', 3]]);
  assert.equal(changed, 2);
  assert.equal(mergeHistory(history, [['2026-03-01', 3]]).changed, 0);
});

test('파생지표: 금리차와 5y5y 선도 기대인플레이션 (FRED 공식)', () => {
  const r = derive({ op: 'diff' }, [['2026-01-02', 4.5]], [['2026-01-02', 4.0]]);
  assert.deepEqual(r, [['2026-01-02', 0.5]]);
  const f = derive({ op: 'fwd5y5y' }, [['d', 2.3]], [['d', 2.2]]);
  assert.ok(Math.abs(f[0][1] - 2.4) < 0.01);
});

test('NBER 침체 지표: 정점 다음 달부터 저점 달까지 1', () => {
  const s = buildUsrec([{ peak: '', trough: '2019-12-01' }, { peak: '2020-02-01', trough: '2020-04-01' }], new Date('2020-06-15'));
  const m = Object.fromEntries(s);
  assert.equal(m['2020-02-01'], 0);
  assert.equal(m['2020-03-01'], 1);
  assert.equal(m['2020-04-01'], 1);
  assert.equal(m['2020-05-01'], 0);
});

test('EIA 표 파싱: 주 시작일 + 요일 칸, 빈 칸 무시', () => {
  const html = "<td class='B6'>&nbsp;&nbsp;2026 Oct-12 to Oct-16</td> <td class='B3'>98.73</td> <td class='B3'>100.86</td> <td class='B3'></td> <td class='B3'></td> <td class='B3'>99.1</td>";
  assert.deepEqual(parseEiaDaily(html), [['2026-10-12', 98.73], ['2026-10-13', 100.86], ['2026-10-16', 99.1]]);
});
