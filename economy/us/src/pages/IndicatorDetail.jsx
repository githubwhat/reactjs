import RiskFlag from '../components/RiskFlag.jsx';
import SeriesChart from '../components/SeriesChart.jsx';
import { useJson } from '../lib/useJson.js';
import { changeDirection, formatChange, formatDate, formatDateTime, formatValue, FREQ_KO } from '../lib/format.js';

function Stat({ label, children, className = '' }) {
  return (
    <div className="stat">
      <dt>{label}</dt>
      <dd className={className}>{children}</dd>
    </div>
  );
}

export default function IndicatorDetail({ id, meta }) {
  const { loading, data, error } = useJson(meta ? `series/${id}.json` : null);

  return (
    <article className="detail">
      {!meta && <p className="error">알 수 없는 지표입니다: {id}</p>}

      {meta && (
        <>
          <header className="detail-head">
            <h1>{meta.ko}</h1>
            <p className="detail-en">{meta.en}</p>
          </header>

          {loading && <p className="muted">불러오는 중…</p>}
          {error && <p className="error">데이터를 불러오지 못했습니다. ({error.message})</p>}
          {!loading && !error && !data && (
            <p className="notice">이 지표는 아직 원천 데이터가 연결되지 않아 표시할 실데이터가 없습니다.</p>
          )}

          {data && (
            <>
              {data.stale && (
                <p className="stale-banner">
                  업데이트 지연 — {data.staleReason || '최근 수집에 실패하여 마지막 정상 데이터를 표시합니다.'}
                </p>
              )}

              <dl className="stats">
                <Stat label="최근 발표값" className="big">{formatValue(data.latest, data.unit)}</Stat>
                <Stat label="관측 기준일">{formatDate(data.date)}</Stat>
                <Stat label="전기 대비 변화" className={`chg-${changeDirection(data.change)}`}>
                  {formatChange(data.change, data.unit)}
                </Stat>
                {data.yoy && (
                  <Stat label="전년 동기 대비" className={`chg-${changeDirection(data.yoy)}`}>
                    {formatChange(data.yoy, data.unit)}
                  </Stat>
                )}
                <Stat label="단위">{data.unit}</Stat>
                <Stat label="발표주기">{FREQ_KO[data.freq] || data.freq}</Stat>
              </dl>

              <section className="risk-box">
                <h2>위험 깃발</h2>
                <p>
                  <RiskFlag risk={data.risk} />
                </p>
                <p className="reason">{data.reason || '판정 근거가 없습니다.'}</p>
              </section>

              <section>
                <h2>시계열 그래프</h2>
                {data.history?.length > 1 ? (
                  <SeriesChart history={data.history} unit={data.unit} freq={data.freq} risk={data.risk} title={meta.ko} />
                ) : (
                  <p className="chart-empty">No Graph</p>
                )}
                {data.history?.length > 0 && (
                  <p className="muted small">
                    수집된 최초 관측일: {formatDate(data.history[0][0])} · 관측값 {data.history.length.toLocaleString()}개
                  </p>
                )}
              </section>

              <footer className="source">
                <p>
                  원본 제공기관:{' '}
                  {data.source?.url ? (
                    <a href={data.source.url} target="_blank" rel="noopener noreferrer">
                      {data.source.name}
                    </a>
                  ) : (
                    data.source?.name || '—'
                  )}
                </p>
                <p>데이터 업데이트: {formatDateTime(data.updatedAt)}</p>
                {data.fred && <p>참고 식별자(FRED): {data.fred} — 지표 정의 확인용이며 FRED에서 수집하지 않습니다.</p>}
                {data.note && <p>비고: {data.note}</p>}
                {data.source?.notice && <p className="small muted">{data.source.notice}</p>}
              </footer>
            </>
          )}
        </>
      )}
    </article>
  );
}
