import express, { type ErrorRequestHandler } from "express";
import cors from "cors";
import { healthRouter } from "./routes/health.js";
import { roomsRouter } from "./routes/rooms.js";
import { employeesRouter } from "./routes/employees.js";
import { businessHoursRouter } from "./routes/business-hours.js";
import { bookingsRouter } from "./routes/bookings.js";
import { createBookingRateLimiter, type RateLimiterOptions } from "./rate-limit.js";

const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "internal_server_error" });
};

export type CreateAppOptions = {
  // Overrides the booking-creation rate limiter's defaults — used by
  // backend/test/bookings-rate-limit.test.ts to run a small/fast window
  // instead of the real 30-per-60s one, and by backend/test/bookings.test.ts
  // to opt out entirely since it exercises POST /api/bookings heavily for
  // unrelated reasons. Production and every other test file get the
  // defaults by omitting this.
  bookingRateLimit?: RateLimiterOptions;
};

export function createApp(options: CreateAppOptions = {}) {
  const app = express();

  const frontendOrigin = process.env.FRONTEND_ORIGIN ?? "http://localhost:3000";
  app.use(cors({ origin: frontendOrigin }));
  app.use(express.json());

  app.use(healthRouter);
  app.use(roomsRouter);
  app.use(employeesRouter);
  app.use(businessHoursRouter);
  // Mounted ahead of bookingsRouter, scoped to this exact method+path
  // (IR-13/NFR-SEC-03) — a fresh limiter (and its request-log state) is
  // created per createApp() call, the same way each backend/test/*.test.ts
  // file gets its own SQLite state, so no two callers share a quota.
  app.post("/api/bookings", createBookingRateLimiter(options.bookingRateLimit));
  app.use(bookingsRouter);

  app.use(errorHandler);

  return app;
}
