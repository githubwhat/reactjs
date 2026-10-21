import { useEffect, useState } from 'react';
import { loadJson } from './data.js';

// path가 null이면 아무것도 불러오지 않는다 (접힌 대분류 등).
export function useJson(path) {
  const [state, setState] = useState({ loading: !!path, data: null, error: null });

  useEffect(() => {
    if (!path) return;
    let alive = true;
    setState({ loading: true, data: null, error: null });
    loadJson(path)
      .then((data) => alive && setState({ loading: false, data, error: null }))
      .catch((error) => alive && setState({ loading: false, data: null, error }));
    return () => {
      alive = false;
    };
  }, [path]);

  return state;
}
