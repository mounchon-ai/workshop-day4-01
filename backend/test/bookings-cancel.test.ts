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
    status: string;
  };
}

describe("POST /api/bookings/:id/cancel — ownership and validity", () => {
  it("returns 404 for a booking that does not exist", async () => {
    const employee = await createEmployee();

    const response = await request(app)
      .post("/api/bookings/does-not-exist/cancel")
      .send({ employeeId: employee.id });

    expect(response.status).toBe(404);
    expect(response.body.error).toBe("booking_not_found");
  });

  it("rejects a cancellation from someone other than the owner", async () => {
    const room = await createRoom();
    const owner = await createEmployee();
    const other = await createEmployee({ firstName: "วิภา", lastName: "สุขใจ" });
    const booking = await createBooking(room.id, owner.id);

    const response = await request(app)
      .post(`/api/bookings/${booking.id}/cancel`)
      .send({ employeeId: other.id });

    expect(response.status).toBe(403);
    expect(response.body.error).toBe("not_owner");

    const stillConfirmed = await prisma.booking.findUnique({ where: { id: booking.id } });
    expect(stillConfirmed?.status).toBe("confirmed");
  });

  it("rejects cancelling a booking whose end time has already passed", async () => {
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

    const response = await request(app)
      .post(`/api/bookings/${pastBooking.id}/cancel`)
      .send({ employeeId: employee.id });

    expect(response.status).toBe(409);
    expect(response.body.error).toBe("booking_ended");
  });

  it("rejects an empty employeeId with a 400", async () => {
    const room = await createRoom();
    const employee = await createEmployee();
    const booking = await createBooking(room.id, employee.id);

    const response = await request(app)
      .post(`/api/bookings/${booking.id}/cancel`)
      .send({ employeeId: "" });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("validation_error");
  });
});

describe("POST /api/bookings/:id/cancel — idempotency (DR-08)", () => {
  it("cancelling an already-cancelled booking reports its current status without changing data", async () => {
    const room = await createRoom();
    const employee = await createEmployee();
    const booking = await createBooking(room.id, employee.id);

    const first = await request(app)
      .post(`/api/bookings/${booking.id}/cancel`)
      .send({ employeeId: employee.id });
    expect(first.status).toBe(200);

    const second = await request(app)
      .post(`/api/bookings/${booking.id}/cancel`)
      .send({ employeeId: employee.id });

    expect(second.status).toBe(409);
    expect(second.body.error).toBe("already_cancelled");
    expect(second.body.booking).toMatchObject({ id: booking.id, status: "cancelled" });

    const auditEntries = await prisma.bookingAudit.findMany({
      where: { bookingId: booking.id, action: "cancel" },
    });
    expect(auditEntries).toHaveLength(1);
  });

  it("reports already_cancelled, not booking_ended, for a booking that is both cancelled and past its endAt", async () => {
    const room = await createRoom();
    const employee = await createEmployee();
    const cancelledAndEnded = await prisma.booking.create({
      data: {
        roomId: room.id,
        employeeId: employee.id,
        title: "ยกเลิกและผ่านไปแล้ว",
        attendeeCount: 3,
        startAt: new Date("2020-01-06T09:00:00+07:00"),
        endAt: new Date("2020-01-06T10:00:00+07:00"),
        status: "cancelled",
      },
    });

    const response = await request(app)
      .post(`/api/bookings/${cancelledAndEnded.id}/cancel`)
      .send({ employeeId: employee.id });

    expect(response.status).toBe(409);
    expect(response.body.error).toBe("already_cancelled");
  });
});

describe("POST /api/bookings/:id/cancel — success (FR-BKG-14/15)", () => {
  it("flips the booking to cancelled and writes one cancel audit entry", async () => {
    const room = await createRoom();
    const employee = await createEmployee();
    const booking = await createBooking(room.id, employee.id);

    const response = await request(app)
      .post(`/api/bookings/${booking.id}/cancel`)
      .send({ employeeId: employee.id });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ id: booking.id, status: "cancelled" });

    const stored = await prisma.booking.findUnique({ where: { id: booking.id } });
    expect(stored?.status).toBe("cancelled");

    const auditEntries = await prisma.bookingAudit.findMany({
      where: { bookingId: booking.id },
      orderBy: { actedAt: "asc" },
    });
    expect(auditEntries).toHaveLength(2); // create + cancel
    expect(auditEntries[1]).toMatchObject({ action: "cancel", actorEmployeeId: employee.id });
  });

  it("does not delete the booking row (DR-08 keeps history)", async () => {
    const room = await createRoom();
    const employee = await createEmployee();
    const booking = await createBooking(room.id, employee.id);

    await request(app).post(`/api/bookings/${booking.id}/cancel`).send({ employeeId: employee.id });

    const stillThere = await request(app).get(`/api/bookings/${booking.id}`);
    expect(stillThere.status).toBe(200);
  });
});

describe("POST /api/bookings/:id/cancel — reopens the slot (FR-BKG-16)", () => {
  it("lets a new booking be created for the same room and time after cancellation", async () => {
    const room = await createRoom();
    const employee = await createEmployee();
    const booking = await createBooking(room.id, employee.id);

    const cancelled = await request(app)
      .post(`/api/bookings/${booking.id}/cancel`)
      .send({ employeeId: employee.id });
    expect(cancelled.status).toBe(200);

    const created = await request(app)
      .post("/api/bookings")
      .send({
        roomId: room.id,
        employeeId: employee.id,
        title: "ประชุมใหม่",
        attendeeCount: 5,
        date: FUTURE_MONDAY,
        startTime: "09:00",
        endTime: "10:00",
      });

    expect(created.status).toBe(201);
  });

  it("no longer counts the cancelled booking as a conflict when editing another booking into its slot", async () => {
    const room = await createRoom();
    const employee = await createEmployee();
    const toCancel = await createBooking(room.id, employee.id, { startTime: "09:00", endTime: "10:00" });
    const other = await createBooking(room.id, employee.id, { startTime: "11:00", endTime: "12:00" });

    await request(app).post(`/api/bookings/${toCancel.id}/cancel`).send({ employeeId: employee.id });

    const response = await request(app)
      .put(`/api/bookings/${other.id}`)
      .send({
        roomId: room.id,
        employeeId: employee.id,
        title: "ย้ายเวลา",
        attendeeCount: 5,
        date: FUTURE_MONDAY,
        startTime: "09:00",
        endTime: "10:00",
      });

    expect(response.status).toBe(200);
  });
});

describe("POST /api/bookings/:id/cancel — concurrency", () => {
  it("lets exactly one of several concurrent cancel requests write an audit entry", async () => {
    const room = await createRoom();
    const employee = await createEmployee();
    const booking = await createBooking(room.id, employee.id);

    const responses = await Promise.all(
      Array.from({ length: 5 }, () =>
        request(app).post(`/api/bookings/${booking.id}/cancel`).send({ employeeId: employee.id }),
      ),
    );

    const statuses = responses.map((r) => r.status).sort((a, b) => a - b);
    expect(statuses.filter((s) => s === 200)).toHaveLength(1);
    expect(statuses.filter((s) => s === 409)).toHaveLength(4);

    const auditEntries = await prisma.bookingAudit.findMany({
      where: { bookingId: booking.id, action: "cancel" },
    });
    expect(auditEntries).toHaveLength(1);
  });
});

describe("PUT /api/bookings/:id — cannot edit a cancelled booking", () => {
  it("rejects editing a booking that has already been cancelled", async () => {
    const room = await createRoom();
    const employee = await createEmployee();
    const cancelledBooking = await prisma.booking.create({
      data: {
        roomId: room.id,
        employeeId: employee.id,
        title: "ยกเลิกแล้ว",
        attendeeCount: 3,
        startAt: new Date(`${FUTURE_MONDAY}T09:00:00+07:00`),
        endAt: new Date(`${FUTURE_MONDAY}T10:00:00+07:00`),
        status: "cancelled",
      },
    });

    const response = await request(app)
      .put(`/api/bookings/${cancelledBooking.id}`)
      .send({
        roomId: room.id,
        employeeId: employee.id,
        title: "พยายามแก้ไข",
        attendeeCount: 4,
        date: FUTURE_MONDAY,
        startTime: "11:00",
        endTime: "12:00",
      });

    expect(response.status).toBe(409);
    expect(response.body.error).toBe("booking_cancelled");
  });
});
