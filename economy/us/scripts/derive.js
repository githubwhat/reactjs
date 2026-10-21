// 공식 원천 시계열로 계산하는 파생지표 (FRED와 같은 정의)
import { round } from './lib/store.js';

const toMap = (hist) => new Map(hist);

const OPS = {
  // a − b (같은 날짜끼리)
  diff: (a, b) => round(a - b, 4),
  // 5년 후 5년 기대인플레이션: ((1+BE10)^10 / (1+BE5)^5)^(1/5) − 1
  fwd5y5y: (be10, be5) => round(((((1 + be10 / 100) ** 10) / ((1 + be5 / 100) ** 5)) ** (1 / 5) - 1) * 100, 4),
  // 명목값 ÷ CPI(1982-84=100) × 100
  deflate: (a, cpi) => round((a / cpi) * 100, 1),
};

export function derive(ref, histA, histB) {
  const op = OPS[ref.op];
  if (!op) throw new Error(`알 수 없는 파생 연산 ${ref.op}`);
  const b = toMap(histB);
  const out = [];
  for (const [d, va] of histA) {
    const vb = b.get(d);
    if (vb !== undefined && vb !== null && va !== null) out.push([d, op(va, vb)]);
  }
  return out;
}
