import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/prisma.js";
import { resetDb } from "./reset-db.js";

const app = createApp();

// Computed relative to "now" so these tests stay valid whenever they run,
// rather than hardcoding a date that will eventually be in the past.
function nextDateWithDayOfWeek(targetDayOfWeek: number, minDaysOut = 3): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + minDaysOut);
  while (d.getUTCDay() !== targetDayOfWeek) {
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return d.toISOString().slice(0, 10);
}

const FUTURE_MONDAY = nextDateWithDayOfWeek(1); // business hours open
const FUTURE_SATURDAY = nextDateWithDayOfWeek(6); // business hours closed
const PAST_DATE = "2020-01-06"; // unambiguously in the past

const validRoom = { name: "ห้องประชุมใหญ่", capacity: 10, building: "อาคาร A", floor: "3" };
const validEmployee = { firstName: "สมชาย", lastName: "ใจดี", department: "ฝ่ายบุคคล" };

beforeEach(async () => {
  await resetDb();
});

async function createRoom(overrides: Partial<typeof validRoom> = {}) {
  const response = await request(app)
    .post("/api/rooms")
    .send({ ...validRoom, ...overrides });
  return response.body as { id: string; capacity: number };
}

async function createEmployee() {
  const response = await request(app).post("/api/employees").send(validEmployee);
  return response.body as { id: string; firstName: string; lastName: string };
}

function bookingPayload(roomId: string, employeeId: string, overrides: Record<string, unknown> = {}) {
  return {
    roomId,
    employeeId,
    title: "ประชุมทีม",
    attendeeCount: 5,
    date: FUTURE_MONDAY,
    startTime: "09:00",
    endTime: "10:00",
    ...overrides,
  };
}

describe("POST /api/bookings — 400 validation (structural / FR-BKG-08 / FR-BKG-09)", () => {
  it("rejects a booking with no owner selected (FR-EMP-03)", async () => {
    const room = await createRoom();

    const response = await request(app)
      .post("/api/bookings")
      .send(bookingPayload(room.id, ""));

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("validation_error");
    const fields = response.body.fields.map((f: { field: string }) => f.field);
    expect(fields).toContain("employeeId");
  });

  it("rejects a booking with no title (FR-BKG-11)", async () => {
    const room = await createRoom();
    const employee = await createEmployee();

    const response = await request(app)
      .post("/api/bookings")
      .send(bookingPayload(room.id, employee.id, { title: "" }));

    expect(response.status).toBe(400);
    const fields = response.body.fields.map((f: { field: string }) => f.field);
    expect(fields).toContain("title");
  });

  it("rejects an end time that is not after the start time (FR-BKG-08)", async () => {
    const room = await createRoom();
    const employee = await createEmployee();

    const response = await request(app)
      .post("/api/bookings")
      .send(bookingPayload(room.id, employee.id, { startTime: "10:00", endTime: "09:00" }));

    expect(response.status).toBe(400);
    const fields = response.body.fields.map((f: { field: string }) => f.field);
    expect(fields).toContain("endTime");
  });

  it("rejects a start time in the past (FR-BKG-09)", async () => {
    const room = await createRoom();
    const employee = await createEmployee();

    const response = await request(app)
      .post("/api/bookings")
      .send(bookingPayload(room.id, employee.id, { date: PAST_DATE }));

    expect(response.status).toBe(400);
    const fields = response.body.fields.map((f: { field: string }) => f.field);
    expect(fields).toContain("startTime");
  });

  it("reports multiple structural failures together, not just the first", async () => {
    const room = await createRoom();
    const employee = await createEmployee();

    const response = await request(app)
      .post("/api/bookings")
      .send(bookingPayload(room.id, employee.id, { title: "", startTime: "10:00", endTime: "09:00" }));

    expect(response.status).toBe(400);
    const fields = response.body.fields.map((f: { field: string }) => f.field);
    expect(fields).toEqual(expect.arrayContaining(["title", "endTime"]));
  });
});

describe("POST /api/bookings — 404 for missing references", () => {
  it("rejects a booking for a room that does not exist", async () => {
    const employee = await createEmployee();

    const response = await request(app)
      .post("/api/bookings")
      .send(bookingPayload("does-not-exist", employee.id));

    expect(response.status).toBe(404);
    expect(response.body.error).toBe("room_not_found");
  });

  it("rejects a booking for an employee that does not exist", async () => {
    const room = await createRoom();

    const response = await request(app)
      .post("/api/bookings")
      .send(bookingPayload(room.id, "does-not-exist"));

    expect(response.status).toBe(404);
    expect(response.body.error).toBe("employee_not_found");
  });

  it("rejects a booking for a room that has been disabled", async () => {
    const room = await createRoom();
    const employee = await createEmployee();
    await prisma.room.update({ where: { id: room.id }, data: { status: "disabled" } });

    const response = await request(app)
      .post("/api/bookings")
      .send(bookingPayload(room.id, employee.id));

    expect(response.status).toBe(404);
    expect(response.body.error).toBe("room_disabled");
  });

  it("rejects a booking for an employee that has been disabled", async () => {
    const room = await createRoom();
    const employee = await createEmployee();
    await prisma.employee.update({ where: { id: employee.id }, data: { status: "disabled" } });

    const response = await request(app)
      .post("/api/bookings")
      .send(bookingPayload(room.id, employee.id));

    expect(response.status).toBe(404);
    expect(response.body.error).toBe("employee_disabled");
  });
});

describe("POST /api/bookings — 409 rule rejection (FR-BKG-05 to 07, FR-BKG-10)", () => {
  it("rejects a time outside business hours", async () => {
    const room = await createRoom();
    const employee = await createEmployee();

    const response = await request(app)
      .post("/api/bookings")
      .send(bookingPayload(room.id, employee.id, { startTime: "06:00", endTime: "07:00" }));

    expect(response.status).toBe(409);
    expect(response.body.error).toBe("booking_rejected");
    const rules = response.body.reasons.map((r: { rule: string }) => r.rule);
    expect(rules).toContain("outside_business_hours");
  });

  it("rejects a closed day", async () => {
    const room = await createRoom();
    const employee = await createEmployee();

    const response = await request(app)
      .post("/api/bookings")
      .send(bookingPayload(room.id, employee.id, { date: FUTURE_SATURDAY }));

    expect(response.status).toBe(409);
    const rules = response.body.reasons.map((r: { rule: string }) => r.rule);
    expect(rules).toContain("outside_business_hours");
  });

  it("rejects an attendee count above the room's capacity", async () => {
    const room = await createRoom({ capacity: 4 });
    const employee = await createEmployee();

    const response = await request(app)
      .post("/api/bookings")
      .send(bookingPayload(room.id, employee.id, { attendeeCount: 10 }));

    expect(response.status).toBe(409);
    const rules = response.body.reasons.map((r: { rule: string }) => r.rule);
    expect(rules).toContain("capacity_exceeded");
  });

  it("rejects a time overlapping an existing confirmed booking", async () => {
    const room = await createRoom();
    const employee = await createEmployee();
    await prisma.booking.create({
      data: {
        roomId: room.id,
        employeeId: employee.id,
        title: "ประชุมเดิม",
        attendeeCount: 2,
        startAt: new Date(`${FUTURE_MONDAY}T09:00:00+07:00`),
        endAt: new Date(`${FUTURE_MONDAY}T10:00:00+07:00`),
        status: "confirmed",
      },
    });

    const response = await request(app)
      .post("/api/bookings")
      .send(bookingPayload(room.id, employee.id, { startTime: "09:30", endTime: "10:30" }));

    expect(response.status).toBe(409);
    const rules = response.body.reasons.map((r: { rule: string }) => r.rule);
    expect(rules).toContain("conflict");
  });

  it("does not let a cancelled booking block a new one at the same time", async () => {
    const room = await createRoom();
    const employee = await createEmployee();
    await prisma.booking.create({
      data: {
        roomId: room.id,
        employeeId: employee.id,
        title: "ยกเลิกแล้ว",
        attendeeCount: 2,
        startAt: new Date(`${FUTURE_MONDAY}T09:00:00+07:00`),
        endAt: new Date(`${FUTURE_MONDAY}T10:00:00+07:00`),
        status: "cancelled",
      },
    });

    const response = await request(app)
      .post("/api/bookings")
      .send(bookingPayload(room.id, employee.id));

    expect(response.status).toBe(201);
  });

  it("reports business hours, capacity, and conflict together when all three fail at once", async () => {
    const room = await createRoom({ capacity: 4 });
    const employee = await createEmployee();
    await prisma.booking.create({
      data: {
        roomId: room.id,
        employeeId: employee.id,
        title: "ประชุมเดิม",
        attendeeCount: 2,
        startAt: new Date(`${FUTURE_MONDAY}T06:00:00+07:00`),
        endAt: new Date(`${FUTURE_MONDAY}T07:00:00+07:00`),
        status: "confirmed",
      },
    });

    const response = await request(app).post("/api/bookings").send(
      bookingPayload(room.id, employee.id, {
        startTime: "06:00",
        endTime: "07:00",
        attendeeCount: 10,
      }),
    );

    expect(response.status).toBe(409);
    const rules = response.body.reasons.map((r: { rule: string }) => r.rule);
    expect(rules).toEqual(
      expect.arrayContaining(["outside_business_hours", "capacity_exceeded", "conflict"]),
    );
  });
});

describe("POST /api/bookings — success", () => {
  it("creates a confirmed booking with full room and employee detail, and one audit entry", async () => {
    const room = await createRoom();
    const employee = await createEmployee();

    const response = await request(app)
      .post("/api/bookings")
      .send(bookingPayload(room.id, employee.id, { title: "ประชุมทีมขาย", attendeeCount: 6 }));

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      title: "ประชุมทีมขาย",
      attendeeCount: 6,
      status: "confirmed",
      room: { id: room.id },
      employee: { id: employee.id, firstName: employee.firstName },
    });

    const auditEntries = await prisma.bookingAudit.findMany({
      where: { bookingId: response.body.id },
    });
    expect(auditEntries).toHaveLength(1);
    expect(auditEntries[0]).toMatchObject({
      action: "create",
      actorEmployeeId: employee.id,
    });
    expect(auditEntries[0].actedAt).toBeInstanceOf(Date);
  });
});

describe("POST /api/bookings — concurrency (NFR-PERF-06)", () => {
  it("lets exactly one of several concurrent overlapping requests succeed, with no server errors", async () => {
    const room = await createRoom();
    const employee = await createEmployee();

    const responses = await Promise.all(
      Array.from({ length: 8 }, () => request(app).post("/api/bookings").send(bookingPayload(room.id, employee.id))),
    );

    const statuses = responses.map((r) => r.status).sort((a, b) => a - b);
    expect(statuses.filter((s) => s === 201)).toHaveLength(1);
    expect(statuses.filter((s) => s === 409)).toHaveLength(7);
    expect(statuses.filter((s) => s >= 500)).toHaveLength(0);

    const bookings = await prisma.booking.findMany({ where: { roomId: room.id, status: "confirmed" } });
    expect(bookings).toHaveLength(1);
  });
});
