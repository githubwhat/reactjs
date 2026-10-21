import FlagDot from './FlagDot.jsx';
import Sparkline from './Sparkline.jsx';
import { formatShort } from '../lib/format.js';

// 한 줄: 깃발 · 이름 · 최신 수치 · 작은 그래프
export default function IndicatorRow({ row, label, href }) {
  return (
    <li>
      <a className="irow" href={href}>
        <FlagDot risk={row.risk} />
        <span className="irow-name">
          {label || row.ko}
          {row.stale && <span className="stale">지연</span>}
        </span>
        <span className="irow-val">{formatShort(row.latest, row.unit)}</span>
        <span className="irow-spark">
          <Sparkline values={row.spark} risk={row.risk} />
        </span>
      </a>
    </li>
  );
}
