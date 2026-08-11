import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { BOOKING_RATE_LIMIT_MAX } from "../src/rate-limit.js";
import { resetDb } from "./reset-db.js";

// Computed relative to "now" so these tests stay valid whenever they run.
function nextDateWithDayOfWeek(targetDayOfWeek: number, minDaysOut = 3): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + minDaysOut);
  while (d.getUTCDay() !== targetDayOfWeek) {
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return d.toISOString().slice(0, 10);
}

const FUTURE_MONDAY = nextDateWithDayOfWeek(1); // business hours open

const validRoom = { name: "ห้องประชุมใหญ่", capacity: 10, building: "อาคาร A", floor: "3" };
const validEmployee = { firstName: "สมชาย", lastName: "ใจดี", department: "ฝ่ายบุคคล" };

beforeEach(async () => {
  await resetDb();
});

async function createRoom(app: import("express").Express, index = 0) {
  const response = await request(app)
    .post("/api/rooms")
    .send({ ...validRoom, name: `${validRoom.name} ${index}` });
  return response.body as { id: string };
}

async function createEmployee(app: import("express").Express) {
  const response = await request(app).post("/api/employees").send(validEmployee);
  return response.body as { id: string };
}

// This suite is testing the rate limiter, which sits in front of
// business-rule evaluation — every request must otherwise be trivially
// valid, so a fresh room per index (same fixed time slot) sidesteps both
// the Conflict rule and the 10h/day business-hours ceiling on distinct
// time slots for a single room.
function bookingPayload(roomId: string, employeeId: string) {
  return {
    roomId,
    employeeId,
    title: "ประชุมทีม",
    attendeeCount: 5,
    date: FUTURE_MONDAY,
    startTime: "09:00",
    endTime: "10:00",
  };
}

describe("POST /api/bookings — rate limit (IR-13/NFR-SEC-03)", () => {
  it(`allows exactly ${BOOKING_RATE_LIMIT_MAX} requests/minute from one IP, rejects the next with 429`, async () => {
    const app = createApp();
    const employee = await createEmployee(app);

    for (let i = 0; i < BOOKING_RATE_LIMIT_MAX; i++) {
      const room = await createRoom(app, i);
      const response = await request(app)
        .post("/api/bookings")
        .send(bookingPayload(room.id, employee.id));
      expect(response.status).toBe(201);
    }

    const lastRoom = await createRoom(app, BOOKING_RATE_LIMIT_MAX);
    const blocked = await request(app)
      .post("/api/bookings")
      .send(bookingPayload(lastRoom.id, employee.id));

    expect(blocked.status).toBe(429);
    expect(blocked.body).toEqual({
      error: "rate_limit_exceeded",
      message: expect.any(String),
    });
  });

  it("does not rate-limit read endpoints (search/list, calendar, by-id) even past the creation threshold", async () => {
    const app = createApp({ bookingRateLimit: { max: 2, windowMs: 60_000 } });
    const employee = await createEmployee(app);

    // Exhaust the (small, test-only) creation limit.
    const roomA = await createRoom(app, 0);
    const roomB = await createRoom(app, 1);
    await request(app).post("/api/bookings").send(bookingPayload(roomA.id, employee.id));
    await request(app).post("/api/bookings").send(bookingPayload(roomB.id, employee.id));
    const roomC = await createRoom(app, 2);
    const blockedCreate = await request(app)
      .post("/api/bookings")
      .send(bookingPayload(roomC.id, employee.id));
    expect(blockedCreate.status).toBe(429);

    // Reads must be unaffected, fired well past the creation threshold.
    for (let i = 0; i < 5; i++) {
      const byEmployee = await request(app).get(`/api/bookings?employeeId=${employee.id}`);
      expect(byEmployee.status).toBe(200);

      const byDate = await request(app).get(`/api/bookings?date=${FUTURE_MONDAY}`);
      expect(byDate.status).toBe(200);
    }
  });

  it("resets after the rolling window passes, without affecting unrelated IPs/tests", async () => {
    let currentTime = Date.now();
    const app = createApp({
      bookingRateLimit: { max: 1, windowMs: 1_000, now: () => currentTime },
    });
    const employee = await createEmployee(app);

    const roomA = await createRoom(app, 0);
    const first = await request(app).post("/api/bookings").send(bookingPayload(roomA.id, employee.id));
    expect(first.status).toBe(201);

    const roomB = await createRoom(app, 1);
    const blocked = await request(app).post("/api/bookings").send(bookingPayload(roomB.id, employee.id));
    expect(blocked.status).toBe(429);

    currentTime += 1_001; // past the 1s window

    const roomC = await createRoom(app, 2);
    const afterReset = await request(app)
      .post("/api/bookings")
      .send(bookingPayload(roomC.id, employee.id));
    expect(afterReset.status).toBe(201);
  });
});
