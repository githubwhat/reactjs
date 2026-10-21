import { useEffect, useState } from 'react';
import config from '../config/indicators.json';
import CategoryPanel from './components/CategoryPanel.jsx';
import IndicatorRow from './components/IndicatorRow.jsx';
import RiskFlag from './components/RiskFlag.jsx';
import { useJson } from './lib/useJson.js';
import { formatDateTime, RISK } from './lib/format.js';

const byId = Object.fromEntries(config.indicators.map((i) => [i.id, i]));
const catByCode = Object.fromEntries(config.categories.map((c) => [c.code, c]));

// 정적 호스팅에서 새로고침해도 깨지지 않도록 해시 라우팅
//   #/            Home
//   #/c/J         J 분야 패널
//   #/c/J/gfdebtn 패널 안 지표 상세
function useHashRoute() {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  // 예전 주소(#/i/{id}) 호환
  const legacy = hash.match(/^#\/i\/([a-z0-9_]+)/);
  if (legacy && byId[legacy[1]]) return { cat: byId[legacy[1]].cat, id: legacy[1] };

  const m = hash.match(/^#\/c\/([A-J])(?:\/([a-z0-9_]+))?/);
  return m && catByCode[m[1]] ? { cat: m[1], id: m[2] } : {};
}

export default function App() {
  const route = useHashRoute();
  const summary = useJson('summary.json');
  const s = summary.data;

  return (
    <div className="app">
      <header className="site-head">
        <a href="#/" className="logo">
          USAPI <span>— US Economic Indicators</span>
        </a>
      </header>

      <main>
        {summary.loading && <p className="muted">불러오는 중…</p>}
        {summary.error && <p className="error">데이터를 불러오지 못했습니다. ({summary.error.message})</p>}
        {!summary.loading && !summary.error && !s && <p className="notice">아직 수집된 실데이터가 없습니다.</p>}

        {s && (
          <>
            <div className="home-meta">
              <ul className="tally" aria-label="위험 깃발 분포">
                {Object.keys(RISK).map((k) => (
                  <li key={k}>
                    <RiskFlag risk={k} /> <strong>{s.riskTally?.[k] ?? 0}</strong>
                  </li>
                ))}
              </ul>
              <p className="muted small">갱신 {formatDateTime(s.updatedAt)}</p>
            </div>

            <ul className="ilist home-list">
              {s.home.map((r) => (
                <IndicatorRow key={r.id} row={r} label={r.label} href={`#/c/${r.cat}`} />
              ))}
            </ul>
          </>
        )}
      </main>

      <footer className="site-foot">
        <p>위험 깃발은 거시경제 위험도이며 주식·채권 매수·매도 추천이 아닙니다.</p>
        <p>수치는 등록 없이 공개된 미국 공공기관 공식 자료입니다. 출처는 각 지표 화면에 표기합니다.</p>
      </footer>

      {route.cat && <CategoryPanel key={route.cat} category={catByCode[route.cat]} id={route.id} meta={byId[route.id]} />}
    </div>
  );
}
