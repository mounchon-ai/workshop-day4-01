"use client";

import { useEffect, useState } from "react";
import { apiRequest } from "./api";

/**
 * Fetches a list from `path` on mount and whenever `path` changes, and
 * exposes `refresh()` to re-fetch on demand (e.g. after a create/edit).
 * Shared by admin list screens (rooms, employees, ...) instead of each
 * page hand-rolling its own fetch/ignore-flag logic.
 *
 * `path` may be `null` to mean "nothing to fetch yet" (e.g. a list that
 * depends on a not-yet-made selection) — no request is made and `data`
 * reads back as `[]`.
 */
export function useApiList<T>(path: string | null) {
  const [data, setData] = useState<T[]>([]);
  // Which path `data` was fetched for, so a path change never flashes the
  // previous path's results while the new fetch is in flight — setting
  // this only inside the .then() callback (not synchronously in the effect
  // body) keeps this compliant with react-hooks/set-state-in-effect.
  const [dataPath, setDataPath] = useState<string | null>(null);

  useEffect(() => {
    if (path === null) {
      return;
    }

    let ignore = false;
    apiRequest<T[]>(path).then((result) => {
      if (!ignore && result.ok) {
        setData(result.data);
        setDataPath(path);
      }
    });
    return () => {
      ignore = true;
    };
  }, [path]);

  async function refresh() {
    if (path === null) return;
    const result = await apiRequest<T[]>(path);
    if (result.ok) {
      setData(result.data);
      setDataPath(path);
    }
  }

  return { data: path !== null && path === dataPath ? data : [], refresh };
}
