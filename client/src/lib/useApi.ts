import {useEffect, useState} from 'react';
import {ApiError, apiGet} from '../api';

export type ApiState<T> =
  | {status: 'loading'}
  | {status: 'error'; error: ApiError}
  | {status: 'done'; data: T};

/** GETs `path` when the component mounts and again whenever it changes. */
export function useApi<T>(path: string): ApiState<T> {
  const [state, setState] = useState<{path: string; result: ApiState<T>}>({
    path,
    result: {status: 'loading'},
  });

  useEffect(() => {
    let active = true;
    apiGet<T>(path).then(
      (data) => active && setState({path, result: {status: 'done', data}}),
      (err: unknown) => {
        const error =
          err instanceof ApiError ? err : new ApiError(0, 'Could not load');
        if (active) setState({path, result: {status: 'error', error}});
      },
    );
    return () => {
      active = false;
    };
  }, [path]);

  // A result for the previous path is stale until the new one arrives.
  return state.path === path ? state.result : {status: 'loading'};
}
