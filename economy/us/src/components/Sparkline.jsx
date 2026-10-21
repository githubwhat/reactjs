// 축·눈금 없는 작은 추세선 (최근 1년). 그릴 수 없으면 "No Graph".
const W = 120;
const H = 34;
const PAD = 3;

export default function Sparkline({ values, risk = 'unknown' }) {
  if (!values || values.length < 2) return <span className="nograph">No Graph</span>;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values
    .map((v, i) => {
      const x = PAD + (i / (values.length - 1)) * (W - PAD * 2);
      const y = max === min ? H / 2 : PAD + (1 - (v - min) / span) * (H - PAD * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <svg className={`spark line-${risk}`} viewBox={`0 0 ${W} ${H}`} width={W} height={H} aria-hidden="true">
      <polyline points={pts} fill="none" />
    </svg>
  );
}
