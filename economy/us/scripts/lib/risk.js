// 위험 깃발 엔진: config/risk-rules.json 의 지표별 규칙을 시계열에 적용한다.
import { addDays } from './dates.js';

const YOY_TOLERANCE = { daily: 7, weekly: 10, monthly: 0, quarterly: 0, annual: 0, irregular: 7 };

// 1년 전 값: 일·주간은 1년 전 날짜 이전 가장 가까운 관측(허용 오차 내), 월·분기는 정확히 같은 기간
export function valueYearAgo(hist, freq) {
  if (!hist.length) return null;
  const [lastDate] = hist[hist.length - 1];
  const target = `${Number(lastDate.slice(0, 4)) - 1}${lastDate.slice(4)}`;
  const tol = YOY_TOLERANCE[freq] ?? 7;
  const earliest = addDays(target, -tol);
  for (let i = hist.length - 1; i >= 0; i--) {
    const [d, v] = hist[i];
    if (d <= target) return d >= earliest ? v : null;
  }
  return null;
}

const avg = (arr) => arr.reduce((s, x) => s + x, 0) / arr.length;

function rolling(values, n) {
  const out = [];
  for (let i = n - 1; i < values.length; i++) out.push(avg(values.slice(i - n + 1, i + 1)));
  return out;
}

// 지표 이름 → 값 (계산 불가하면 null)
export function metric(name, hist, freq) {
  const vals = hist.map(([, v]) => v);
  const n = vals.length;
  if (!n) return null;
  const latest = vals[n - 1];
  const [kind, a, b] = name.split(':');
  switch (kind) {
    case 'latest':
      return latest;
    case 'chg': {
      const k = Number(a);
      return n > k ? latest - vals[n - 1 - k] : null;
    }
    case 'yoyPct': {
      const y = valueYearAgo(hist, freq);
      return y ? ((latest / y - 1) * 100) : null;
    }
    case 'yoyDiff': {
      const y = valueYearAgo(hist, freq);
      return y === null ? null : latest - y;
    }
    case 'avg':
    case 'min':
    case 'max': {
      const k = Number(a);
      if (n < k) return null;
      const w = vals.slice(n - k);
      return kind === 'avg' ? avg(w) : kind === 'min' ? Math.min(...w) : Math.max(...w);
    }
    case 'sahm': {
      // 실업률 3개월 평균 − 직전 12개월 동안의 3개월 평균 최저치
      if (n < 15) return null;
      const ma = rolling(vals, 3);
      const cur = ma[ma.length - 1];
      return cur - Math.min(...ma.slice(ma.length - 13, ma.length - 1));
    }
    case 'riseFromLow': {
      const win = Number(a);
      const span = Number(b);
      if (n < win + span - 1) return null;
      const ma = rolling(vals, win).slice(-span);
      const low = Math.min(...ma);
      return low > 0 ? (ma[ma.length - 1] / low - 1) * 100 : null;
    }
    default:
      throw new Error(`알 수 없는 지표 ${name}`);
  }
}

const OPS = {
  '<': (x, y) => x < y,
  '<=': (x, y) => x <= y,
  '>': (x, y) => x > y,
  '>=': (x, y) => x >= y,
  '==': (x, y) => x === y,
};

class MissingData extends Error {}

function check(cond, ctx) {
  if (cond.any) return cond.any.some((c) => check(c, ctx));
  if (cond.all) return cond.all.every((c) => check(c, ctx));
  const x = ctx.get(cond.m);
  const y = cond.ref !== undefined ? ctx.refs[cond.ref] : cond.v;
  if (x === null || x === undefined || y === null || y === undefined) throw new MissingData(cond.m);
  return OPS[cond.op](x, y);
}

function fmt(v) {
  if (v === null || v === undefined) return '—';
  const abs = Math.abs(v);
  const d = abs >= 100 ? 0 : abs >= 10 ? 1 : 2;
  const r = Number(v.toFixed(d)) || 0; // -0 방지
  return r.toLocaleString('en-US', { maximumFractionDigits: d });
}

// strict이면 문구에 넣을 값이 없을 때 판단불가로 처리
function fill(text, ctx, strict = false) {
  return text.replace(/\{([a-zA-Z]+(?::\d+)*)\}/g, (_, name) => {
    const v = ctx.get(name);
    if (strict && (v === null || v === undefined)) throw new MissingData(name);
    return fmt(v);
  });
}

// refs: { 지표id: 최신값 } (예: SOFR를 목표범위 상단과 비교)
export function evaluateRisk(spec, hist, freq, refs = {}) {
  if (!spec) {
    return { risk: 'unknown', reason: '정량적 위험 경계값이 뚜렷하지 않은 지표여서 깃발을 부여하지 않습니다.' };
  }
  const cache = new Map();
  const ctx = {
    refs,
    get(name) {
      if (!cache.has(name)) cache.set(name, metric(name, hist, freq));
      return cache.get(name);
    },
  };
  try {
    for (const rule of spec.rules || []) {
      if (check(rule.if, ctx)) return { risk: rule.risk, reason: fill(rule.reason, ctx) };
    }
    if (!spec.default) return { risk: 'unknown', reason: '해당하는 판정 규칙이 없습니다.' };
    // default 문구에 필요한 값이 없으면 판단불가
    return { risk: spec.default.risk, reason: fill(spec.default.reason, ctx, true) };
  } catch (err) {
    if (err instanceof MissingData) {
      return { risk: 'unknown', reason: '판정에 필요한 관측값이 부족합니다.' };
    }
    throw err;
  }
}
