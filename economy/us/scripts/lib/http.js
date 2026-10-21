// 공식 API 호출용 fetch 래퍼: 타임아웃, 재시도(지수 백오프), 원천별 요청 간격.
const UA = 'USAPI-data-collector/1.0';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function request(url, { method = 'GET', body, headers = {}, as = 'text', retries = 3, timeout = 90000 } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        method,
        body,
        headers: { 'User-Agent': UA, ...headers },
        redirect: 'follow',
        signal: AbortSignal.timeout(timeout),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
      if (as === 'json') return await res.json();
      if (as === 'buffer') return new Uint8Array(await res.arrayBuffer());
      return await res.text();
    } catch (err) {
      lastErr = err;
      if (attempt < retries) await sleep(2000 * 2 ** (attempt - 1));
    }
  }
  throw lastErr;
}
