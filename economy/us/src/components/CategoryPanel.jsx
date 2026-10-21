import { lazy, Suspense, useEffect, useRef } from 'react';
import IndicatorRow from './IndicatorRow.jsx';
import { useJson } from '../lib/useJson.js';

// 그래프(Recharts)는 지표 상세를 열 때만 필요하므로 분리 로드
const IndicatorDetail = lazy(() => import('../pages/IndicatorDetail.jsx'));

// 왼쪽에서 밀려 나오는 휴대폰 크기 패널. Home을 누르면 닫힌다.
export default function CategoryPanel({ category, id, meta }) {
  const { loading, data, error } = useJson(`categories/${category.code}.json`);
  const listHref = `#/c/${category.code}`;
  const panelRef = useRef(null);

  // 목록 ↔ 상세 전환 시 패널 맨 위로
  useEffect(() => {
    panelRef.current?.scrollTo(0, 0);
  }, [id]);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && (window.location.hash = '#/');
    window.addEventListener('keydown', onKey);
    document.body.classList.add('panel-open');
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.classList.remove('panel-open');
    };
  }, []);

  return (
    <>
      <a className="backdrop" href="#/" aria-label="Home으로 닫기" />
      <aside className="panel" aria-label={category.ko} ref={panelRef}>
        <nav className="panel-nav">
          <a href="#/" className="home-link">Home</a>
          {id && <a href={listHref} className="list-link">← {category.ko}</a>}
        </nav>

        {id ? (
          <Suspense fallback={<p className="muted pad">불러오는 중…</p>}>
            <IndicatorDetail id={id} meta={meta} />
          </Suspense>
        ) : (
          <>
            <h1 className="panel-title">{category.ko}</h1>
            <p className="panel-en">{category.en}</p>
            {loading && <p className="muted pad">불러오는 중…</p>}
            {error && <p className="error pad">데이터를 불러오지 못했습니다. ({error.message})</p>}
            {data && (
              <ul className="ilist">
                {data.indicators.map((r) => (
                  <IndicatorRow key={r.id} row={r} href={`${listHref}/${r.id}`} />
                ))}
              </ul>
            )}
          </>
        )}
      </aside>
    </>
  );
}
