import { useMemo, useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatValue } from '../lib/format.js';

const RANGES = [
  { key: 'max', label: '전체(최대)' },
  { key: '5y', label: '5년', months: 60 },
  { key: '1y', label: '1년', months: 12 },
  { key: '1m', label: '1개월', months: 1 },
];

// 긴 일간 시계열은 화면 폭보다 점이 훨씬 많으므로 표시용으로만 솎아낸다.
const MAX_POINTS = 1500;

const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 });

function cutoffTime(months) {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() - months);
  return d.getTime();
}

// 발표주기보다 훨씬 긴 공백(예: 30년물 발행 중단기)은 선을 잇지 않도록 null 점을 끼워 넣는다.
const GAP_DAYS = { daily: 10, weekly: 21, monthly: 70, quarterly: 190, annual: 400, irregular: 60 };

function withGaps(points, freq) {
  const limit = (GAP_DAYS[freq] ?? 60) * 86400000;
  const out = [];
  for (let i = 0; i < points.length; i++) {
    if (i > 0 && points[i].t - points[i - 1].t > limit) {
      out.push({ d: '', t: points[i - 1].t + 86400000, v: null });
    }
    out.push(points[i]);
  }
  return out;
}

// 공백 표시용 null 점과 마지막 점은 항상 남긴다.
function thin(points) {
  if (points.length <= MAX_POINTS) return points;
  const step = Math.ceil(points.length / MAX_POINTS);
  return points.filter((p, i) => i % step === 0 || p.v === null || i === points.length - 1);
}

// 기간 길이에 맞춰 1월 1일(연 단위) 또는 매월 1일 눈금을 직접 만든다 — 같은 라벨 중복 방지
function axisTicks(from, to) {
  const spanYears = (to - from) / (365 * 86400000);
  const a = new Date(from);
  const ticks = [];
  if (spanYears > 3) {
    const every = spanYears > 24 ? 5 : spanYears > 10 ? 2 : 1;
    for (let y = a.getUTCFullYear() + 1; ; y++) {
      const t = Date.UTC(y, 0, 1);
      if (t > to) break;
      if (y % every === 0) ticks.push(t);
    }
    return { ticks, fmt: (t) => new Date(t).toISOString().slice(0, 4) };
  }
  if (spanYears > 0.25) {
    const every = spanYears > 1.5 ? 3 : 1;
    for (let k = a.getUTCFullYear() * 12 + a.getUTCMonth() + 1; ; k++) {
      const t = Date.UTC(Math.floor(k / 12), k % 12, 1);
      if (t > to) break;
      if (k % every === 0) ticks.push(t);
    }
    return { ticks, fmt: (t) => new Date(t).toISOString().slice(2, 7) };
  }
  return { ticks: undefined, fmt: (t) => new Date(t).toISOString().slice(5, 10) };
}

function ChartTip({ active, payload, unit }) {
  if (!active || !payload || !payload.length) return null;
  const p = payload[0].payload;
  if (p.v === null) return null;
  return (
    <div className="tip">
      <div className="tip-date">{p.d}</div>
      <div className="tip-val">{formatValue(p.v, unit)}</div>
    </div>
  );
}

export default function SeriesChart({ history, unit, freq, risk = 'unknown', title }) {
  const [range, setRange] = useState('5y');

  const all = useMemo(
    () => withGaps((history || []).map(([d, v]) => ({ d, t: Date.parse(`${d}T00:00:00Z`), v: v ?? null })), freq),
    [history, freq],
  );

  const { points, hasData, axis } = useMemo(() => {
    const r = RANGES.find((x) => x.key === range);
    const from = r.months ? cutoffTime(r.months) : -Infinity;
    const inRange = all.filter((p) => p.t >= from);
    const valid = inRange.filter((p) => p.v !== null);
    return {
      points: thin(inRange),
      hasData: valid.length > 0,
      axis: valid.length ? axisTicks(valid[0].t, valid[valid.length - 1].t) : null,
    };
  }, [all, range]);
  const step = unit === '0/1';

  return (
    <div className={`chart line-${risk}`}>
      <div className="range" role="group" aria-label="그래프 기간">
        {RANGES.map((r) => (
          <button
            key={r.key}
            type="button"
            className={range === r.key ? 'on' : ''}
            aria-pressed={range === r.key}
            onClick={() => setRange(r.key)}
          >
            {r.label}
          </button>
        ))}
      </div>

      {!hasData ? (
        <p className="chart-empty">선택 기간 내 발표자료 없음</p>
      ) : (
        <div className="chart-box" role="img" aria-label={`${title} 시계열 그래프`}>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={points} margin={{ top: 12, right: 12, bottom: 4, left: 0 }}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="t"
                type="number"
                scale="time"
                domain={['dataMin', 'dataMax']}
                ticks={axis.ticks}
                tickFormatter={axis.fmt}
                minTickGap={36}
                tickLine={false}
              />
              <YAxis
                domain={['auto', 'auto']}
                tickFormatter={(v) => compact.format(v)}
                width={52}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip content={<ChartTip unit={unit} />} cursor={{ strokeDasharray: '3 3' }} />
              <Line
                dataKey="v"
                type={step ? 'stepAfter' : 'linear'}
                stroke="#2a78d6"
                strokeWidth={2}
                dot={points.length <= 40 ? { r: 4 } : false}
                activeDot={{ r: 5 }}
                connectNulls={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
