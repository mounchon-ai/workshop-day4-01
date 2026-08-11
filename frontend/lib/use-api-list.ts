"use client";

import { useEffect, useState } from "react";
import { apiRequest } from "./api";

/**
 * Fetches a list from `path` on mount and whenever `path` changes, and
 * exposes `refresh()` to re-fetch on demand (e.g. after a create/edit).
 * Shared by admin list screens (rooms, employees, ...) instead of each
 * page hand-rolling its own fetch/ignore-flag logic.
 */
export function useApiList<T>(path: string) {
  const [data, setData] = useState<T[]>([]);

  useEffect(() => {
    let ignore = false;
    apiRequest<T[]>(path).then((result) => {
      if (!ignore && result.ok) {
        setData(result.data);
      }
    });
    return () => {
      ignore = true;
    };
  }, [path]);

  async function refresh() {
    const result = await apiRequest<T[]>(path);
    if (result.ok) {
      setData(result.data);
    }
  }

  return { data, refresh };
}
