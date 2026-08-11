import { describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { createBookingRateLimiter } from "../src/rate-limit.js";

function mockReq(ip: string): Request {
  return { ip } as Request;
}

function mockRes(): Response {
  const res = {
    status: vi.fn(function (this: Response) {
      return this;
    }),
    json: vi.fn(function (this: Response) {
      return this;
    }),
  };
  return res as unknown as Response;
}

describe("createBookingRateLimiter", () => {
  it("allows requests up to the limit, then rejects the next one with 429", () => {
    const limiter = createBookingRateLimiter({ max: 3, windowMs: 60_000 });
    const req = mockReq("1.2.3.4");
    const next = vi.fn();

    for (let i = 0; i < 3; i++) {
      const res = mockRes();
      limiter(req, res, next);
      expect(next).toHaveBeenCalledTimes(i + 1);
      expect(res.status).not.toHaveBeenCalled();
    }

    const res = mockRes();
    limiter(req, res, next);
    expect(next).toHaveBeenCalledTimes(3);
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith({
      error: "rate_limit_exceeded",
      message: expect.any(String),
    });
  });

  it("counts each source IP independently", () => {
    const limiter = createBookingRateLimiter({ max: 1, windowMs: 60_000 });
    const next = vi.fn();

    const resA1 = mockRes();
    limiter(mockReq("1.1.1.1"), resA1, next);
    expect(resA1.status).not.toHaveBeenCalled();

    const resB1 = mockRes();
    limiter(mockReq("2.2.2.2"), resB1, next);
    expect(resB1.status).not.toHaveBeenCalled();

    const resA2 = mockRes();
    limiter(mockReq("1.1.1.1"), resA2, next);
    expect(resA2.status).toHaveBeenCalledWith(429);
  });

  it("resets once the rolling window has fully passed", () => {
    let currentTime = 1_000_000;
    const limiter = createBookingRateLimiter({ max: 2, windowMs: 1_000, now: () => currentTime });
    const req = mockReq("9.9.9.9");
    const next = vi.fn();

    limiter(req, mockRes(), next);
    limiter(req, mockRes(), next);
    const blocked = mockRes();
    limiter(req, blocked, next);
    expect(blocked.status).toHaveBeenCalledWith(429);

    currentTime += 1_001; // past the window

    const allowed = mockRes();
    limiter(req, allowed, next);
    expect(allowed.status).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(3);
  });

  it("only records a timestamp on requests that are allowed through", () => {
    // A rejected request must not extend its own window by counting itself.
    let currentTime = 1_000_000;
    const limiter = createBookingRateLimiter({ max: 1, windowMs: 1_000, now: () => currentTime });
    const req = mockReq("7.7.7.7");
    const next = vi.fn();

    limiter(req, mockRes(), next); // consumes the only slot at t=1_000_000
    currentTime += 500;
    limiter(req, mockRes(), next); // rejected, must not push a new timestamp
    currentTime += 501; // now 1_001ms past the ORIGINAL timestamp
    const res = mockRes();
    limiter(req, res, next);
    expect(res.status).not.toHaveBeenCalled();
  });
});
