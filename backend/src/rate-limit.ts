import type { NextFunction, Request, Response } from "express";

// IR-13/NFR-SEC-03: booking creation is capped at 30 requests/minute per
// source IP, checked against a rolling (sliding) window — not a fixed
// window — so a burst straddling a window boundary can't slip through with
// up to 2x the intended rate.
export const BOOKING_RATE_LIMIT_MAX = 30;
export const BOOKING_RATE_LIMIT_WINDOW_MS = 60_000;

export type RateLimiterOptions = {
  max?: number;
  windowMs?: number;
  now?: () => number;
};

// A fresh instance (and its own request log) must be created per Express
// app, not shared at module scope — each backend/test/*.test.ts file builds
// its own createApp() and expects its own booking-creation quota, the same
// way each file gets its own SQLite state.
export function createBookingRateLimiter(options: RateLimiterOptions = {}) {
  const max = options.max ?? BOOKING_RATE_LIMIT_MAX;
  const windowMs = options.windowMs ?? BOOKING_RATE_LIMIT_WINDOW_MS;
  const now = options.now ?? Date.now;

  // IP -> timestamps of requests still inside the current rolling window.
  // Grows with the number of distinct IPs that have ever booked, not with
  // request volume — acceptable for this system's small, stable internal
  // user population (ASM-03); a process-lifetime sweep would be needed to
  // reclaim entries for IPs that stop requesting, which this doesn't do.
  const requestLog = new Map<string, number[]>();

  return function bookingRateLimiter(req: Request, res: Response, next: NextFunction) {
    // No reverse proxy sits in front of this app in the documented
    // deployment (single host, two Docker Compose containers) — req.ip is
    // the raw socket address, not a spoofable header, and no `trust proxy`
    // is set. If a proxy is introduced later this must be revisited, or
    // every client will silently collapse into one shared bucket.
    const key = req.ip ?? "unknown";
    const windowStart = now() - windowMs;

    const pruned = (requestLog.get(key) ?? []).filter((timestamp) => timestamp > windowStart);

    if (pruned.length >= max) {
      requestLog.set(key, pruned);
      res.status(429).json({
        error: "rate_limit_exceeded",
        message: "คำขอสร้าง Booking บ่อยเกินไป กรุณาลองใหม่ภายหลัง",
      });
      return;
    }

    pruned.push(now());
    requestLog.set(key, pruned);
    next();
  };
}
