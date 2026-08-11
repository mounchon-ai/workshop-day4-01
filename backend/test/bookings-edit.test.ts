import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/prisma.js";
import { resetDb } from "./reset-db.js";

const app = createApp();

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

async function createRoom(overrides: Partial<typeof validRoom> = {}) {
  const response = await request(app)
    .post("/api/rooms")
    .send({ ...validRoom, ...overrides });
  return response.body as { id: string; capacity: number };
}

async function createEmployee(overrides: Partial<typeof validEmployee> = {}) {
  const response = await request(app)
    .post("/api/employees")
    .send({ ...validEmployee, ...overrides });
  return response.body as { id: string };
}

async function createBooking(roomId: string, employeeId: string, overrides: Record<string, unknown> = {}) {
  const response = await request(app)
    .post("/api/bookings")
    .send({
      roomId,
      employeeId,
      title: "ประชุมทีม",
      attendeeCount: 5,
      date: FUTURE_MONDAY,
      startTime: "09:00",
      endTime: "10:00",
      ...overrides,
    });
  return response.body as {
    id: string;
    title: string;
    attendeeCount: number;
    startAt: string;
    endAt: string;
    employeeId: string;
    roomId: string;
  };
}

function editPayload(roomId: string, employeeId: string, overrides: Record<string, unknown> = {}) {
  return {
    roomId,
    employeeId,
    title: "ประชุมทีม (แก้ไข)",
    attendeeCount: 6,
    date: FUTURE_MONDAY,
    startTime: "11:00",
    endTime: "12:00",
    ...overrides,
  };
}

describe("PUT /api/bookings/:id — ownership and editability", () => {
  it("rejects an edit from someone other than the owner", async () => {
    const room = await createRoom();
    const owner = await createEmployee();
    const other = await createEmployee({ firstName: "วิภา", lastName: "สุขใจ" });
    const booking = await createBooking(room.id, owner.id);

    const response = await request(app)
      .put(`/api/bookings/${booking.id}`)
      .send(editPayload(room.id, other.id));

    expect(response.status).toBe(403);
    expect(response.body.error).toBe("not_owner");
  });

  it("rejects editing a booking whose end time has already passed", async () => {
    const room = await createRoom();
    const employee = await createEmployee();
    const pastBooking = await prisma.booking.create({
      data: {
        roomId: room.id,
        employeeId: employee.id,
        title: "ประชุมเก่า",
        attendeeCount: 3,
        startAt: new Date("2020-01-06T09:00:00+07:00"),
        endAt: new Date("2020-01-06T10:00:00+07:00"),
        status: "confirmed",
      },
    });

    // Submitted date/time is a valid future slot — the rejection must come
    // from the stored booking's endAt already being in the past, not from
    // the payload (which the 400 tier would otherwise catch first).
    const response = await request(app)
      .put(`/api/bookings/${pastBooking.id}`)
      .send(editPayload(room.id, employee.id));

    expect(response.status).toBe(409);
    expect(response.body.error).toBe("booking_ended");
  });

  it("returns 404 for a booking that does not exist", async () => {
    const room = await createRoom();
    const employee = await createEmployee();

    const response = await request(app)
      .put("/api/bookings/does-not-exist")
      .send(editPayload(room.id, employee.id));

    expect(response.status).toBe(404);
    expect(response.body.error).toBe("booking_not_found");
  });
});

describe("PUT /api/bookings/:id — same rule set as creation (FR-BKG-13)", () => {
  it("rejects a malformed edit the same way creation would (400)", async () => {
    const room = await createRoom();
    const employee = await createEmployee();
    const booking = await createBooking(room.id, employee.id);

    const response = await request(app)
      .put(`/api/bookings/${booking.id}`)
      .send(editPayload(room.id, employee.id, { title: "" }));

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("validation_error");
  });

  it("rejects an edit outside business hours", async () => {
    const room = await createRoom();
    const employee = await createEmployee();
    const booking = await createBooking(room.id, employee.id);

    const response = await request(app)
      .put(`/api/bookings/${booking.id}`)
      .send(editPayload(room.id, employee.id, { startTime: "06:00", endTime: "07:00" }));

    expect(response.status).toBe(409);
    const rules = response.body.reasons.map((r: { rule: string }) => r.rule);
    expect(rules).toContain("outside_business_hours");
  });

  it("rejects an edit exceeding the target room's capacity", async () => {
    const room = await createRoom({ capacity: 4 });
    const employee = await createEmployee();
    const booking = await createBooking(room.id, employee.id, { attendeeCount: 3 });

    const response = await request(app)
      .put(`/api/bookings/${booking.id}`)
      .send(editPayload(room.id, employee.id, { attendeeCount: 10 }));

    expect(response.status).toBe(409);
    const rules = response.body.reasons.map((r: { rule: string }) => r.rule);
    expect(rules).toContain("capacity_exceeded");
  });

  it("rejects an edit overlapping a different booking of the same room", async () => {
    const room = await createRoom();
    const employee = await createEmployee();
    const booking = await createBooking(room.id, employee.id, {
      startTime: "09:00",
      endTime: "10:00",
    });
    await createBooking(room.id, employee.id, { startTime: "11:00", endTime: "12:00" });

    const response = await request(app)
      .put(`/api/bookings/${booking.id}`)
      .send(editPayload(room.id, employee.id, { startTime: "11:30", endTime: "12:30" }));

    expect(response.status).toBe(409);
    const rules = response.body.reasons.map((r: { rule: string }) => r.rule);
    expect(rules).toContain("conflict");
  });

  it("leaves the original booking untouched when the edit is rejected", async () => {
    const room = await createRoom({ capacity: 4 });
    const employee = await createEmployee();
    const booking = await createBooking(room.id, employee.id, { attendeeCount: 3 });

    const rejected = await request(app)
      .put(`/api/bookings/${booking.id}`)
      .send(editPayload(room.id, employee.id, { attendeeCount: 10 }));
    expect(rejected.status).toBe(409);

    const stillThere = await request(app).get(`/api/bookings/${booking.id}`);
    expect(stillThere.body).toMatchObject({
      title: booking.title,
      attendeeCount: booking.attendeeCount,
      startAt: booking.startAt,
      endAt: booking.endAt,
    });
  });

  it("does not count the booking's own current time slot as a conflict with itself", async () => {
    const room = await createRoom();
    const employee = await createEmployee();
    const booking = await createBooking(room.id, employee.id, {
      startTime: "09:00",
      endTime: "10:00",
    });

    // Overlaps its own existing 09:00-10:00 slot — must not be treated as a
    // conflict against itself.
    const response = await request(app)
      .put(`/api/bookings/${booking.id}`)
      .send(editPayload(room.id, employee.id, { startTime: "09:30", endTime: "10:30" }));

    expect(response.status).toBe(200);
  });
});

describe("PUT /api/bookings/:id — success", () => {
  it("overwrites the booking, returns full detail, and writes one audit entry", async () => {
    const room = await createRoom();
    const employee = await createEmployee();
    const booking = await createBooking(room.id, employee.id);

    const response = await request(app)
      .put(`/api/bookings/${booking.id}`)
      .send(editPayload(room.id, employee.id));

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id: booking.id,
      title: "ประชุมทีม (แก้ไข)",
      attendeeCount: 6,
      status: "confirmed",
      room: { id: room.id },
      employee: { id: employee.id },
    });

    const auditEntries = await prisma.bookingAudit.findMany({
      where: { bookingId: booking.id },
      orderBy: { actedAt: "asc" },
    });
    expect(auditEntries).toHaveLength(2); // create + update
    expect(auditEntries[1]).toMatchObject({ action: "update", actorEmployeeId: employee.id });
  });

  it("allows moving the booking to a different room", async () => {
    const roomA = await createRoom({ name: "ห้อง A" });
    const roomB = await createRoom({ name: "ห้อง B" });
    const employee = await createEmployee();
    const booking = await createBooking(roomA.id, employee.id);

    const response = await request(app)
      .put(`/api/bookings/${booking.id}`)
      .send(editPayload(roomB.id, employee.id));

    expect(response.status).toBe(200);
    expect(response.body.room.id).toBe(roomB.id);
  });
});
