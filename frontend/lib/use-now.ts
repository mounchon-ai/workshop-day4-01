"use client";

import { useState } from "react";

/**
 * Captured once per mount rather than read directly in the render body —
 * `react-hooks/purity` rejects calling `Date.now()` there. Good enough for
 * "has this already happened" checks over the lifetime of viewing a page;
 * not meant to stay live-ticking.
 */
export function useNow(): number {
  const [now] = useState(() => Date.now());
  return now;
}
