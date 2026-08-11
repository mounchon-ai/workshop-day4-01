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
  return response.body as { id: string; name: string; capacity: number; building: string; floor: string };
}

async function createEmployee() {
  const response = await request(app).post("/api/employees").send(validEmployee);
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
  return response.body as { id: string };
}

function putPayload(room: { name: string; capacity: number; building: string; floor: string }, overrides: Record<string, unknown> = {}) {
  return { name: room.name, capacity: room.capacity, building: room.building, floor: room.floor, ...overrides };
}

describe("PUT /api/rooms/:id — status toggle (FR-ROOM-05)", () => {
  it("disables a room", async () => {
    const room = await createRoom();

    const response = await request(app)
      .put(`/api/rooms/${room.id}`)
      .send(putPayload(room, { status: "disabled" }));

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("disabled");
  });

  it("re-enables a disabled room", async () => {
    const room = await createRoom();
    await prisma.room.update({ where: { id: room.id }, data: { status: "disabled" } });

    const response = await request(app)
      .put(`/api/rooms/${room.id}`)
      .send(putPayload(room, { status: "active" }));

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("active");
  });

  it("leaves status unchanged when not supplied", async () => {
    const room = await createRoom();
    await prisma.room.update({ where: { id: room.id }, data: { status: "disabled" } });

    const response = await request(app).put(`/api/rooms/${room.id}`).send(putPayload(room));

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("disabled");
  });

  it("does not cancel bookings tied to a disabled room", async () => {
    const room = await createRoom();
    const employee = await createEmployee();
    const booking = await createBooking(room.id, employee.id);

    await request(app).put(`/api/rooms/${room.id}`).send(putPayload(room, { status: "disabled" }));

    const stored = await prisma.booking.findUnique({ where: { id: booking.id } });
    expect(stored?.status).toBe("confirmed");
  });
});

describe("PUT /api/rooms/:id — capacity-decrease protection (FR-ROOM-07)", () => {
  it("rejects reducing capacity below a pending confirmed booking's attendeeCount", async () => {
    const room = await createRoom({ capacity: 10 });
    const employee = await createEmployee();
    await createBooking(room.id, employee.id, { attendeeCount: 8 });

    const response = await request(app)
      .put(`/api/rooms/${room.id}`)
      .send(putPayload(room, { capacity: 5 }));

    expect(response.status).toBe(409);
    expect(response.body.error).toBe("capacity_below_pending_bookings");
    expect(response.body.conflictingAttendeeCount).toBe(8);
  });

  it("reports the maximum conflicting attendeeCount when multiple bookings conflict", async () => {
    const room = await createRoom({ capacity: 10 });
    const employee = await createEmployee();
    await createBooking(room.id, employee.id, { attendeeCount: 6, startTime: "09:00", endTime: "10:00" });
    await createBooking(room.id, employee.id, { attendeeCount: 9, startTime: "11:00", endTime: "12:00" });

    const response = await request(app)
      .put(`/api/rooms/${room.id}`)
      .send(putPayload(room, { capacity: 5 }));

    expect(response.status).toBe(409);
    expect(response.body.conflictingAttendeeCount).toBe(9);
  });

  it("allows reducing capacity when no pending booking is affected", async () => {
    const room = await createRoom({ capacity: 10 });
    const employee = await createEmployee();
    await createBooking(room.id, employee.id, { attendeeCount: 4 });

    const response = await request(app)
      .put(`/api/rooms/${room.id}`)
      .send(putPayload(room, { capacity: 5 }));

    expect(response.status).toBe(200);
    expect(response.body.capacity).toBe(5);
  });

  it("ignores a cancelled booking's attendeeCount when checking capacity", async () => {
    const room = await createRoom({ capacity: 10 });
    const employee = await createEmployee();
    const booking = await createBooking(room.id, employee.id, { attendeeCount: 9 });
    await request(app).post(`/api/bookings/${booking.id}/cancel`).send({ employeeId: employee.id });

    const response = await request(app)
      .put(`/api/rooms/${room.id}`)
      .send(putPayload(room, { capacity: 5 }));

    expect(response.status).toBe(200);
  });

  it("ignores a booking whose end time has already passed when checking capacity", async () => {
    const room = await createRoom({ capacity: 10 });
    const employee = await createEmployee();
    await prisma.booking.create({
      data: {
        roomId: room.id,
        employeeId: employee.id,
        title: "ประชุมเก่า",
        attendeeCount: 9,
        startAt: new Date("2020-01-06T09:00:00+07:00"),
        endAt: new Date("2020-01-06T10:00:00+07:00"),
        status: "confirmed",
      },
    });

    const response = await request(app)
      .put(`/api/rooms/${room.id}`)
      .send(putPayload(room, { capacity: 5 }));

    expect(response.status).toBe(200);
  });

  it("leaves the room's capacity unchanged when the edit is rejected", async () => {
    const room = await createRoom({ capacity: 10 });
    const employee = await createEmployee();
    await createBooking(room.id, employee.id, { attendeeCount: 8 });

    await request(app).put(`/api/rooms/${room.id}`).send(putPayload(room, { capacity: 5 }));

    const stored = await prisma.room.findUnique({ where: { id: room.id } });
    expect(stored?.capacity).toBe(10);
  });

  it("does not block a status-only toggle (unchanged capacity) even if a pending booking already exceeds capacity", async () => {
    const room = await createRoom({ capacity: 10 });
    const employee = await createEmployee();
    // Seeded directly, bypassing booking-creation validation, to represent
    // pre-existing bad data — the capacity guard only fires on an actual
    // decrease, not on every PUT, so this must not block re-submitting the
    // room's own unchanged capacity as part of a disable/enable toggle.
    await prisma.booking.create({
      data: {
        roomId: room.id,
        employeeId: employee.id,
        title: "เกิน Capacity อยู่ก่อนแล้ว",
        attendeeCount: 12,
        startAt: new Date(`${FUTURE_MONDAY}T09:00:00+07:00`),
        endAt: new Date(`${FUTURE_MONDAY}T10:00:00+07:00`),
        status: "confirmed",
      },
    });

    const response = await request(app)
      .put(`/api/rooms/${room.id}`)
      .send(putPayload(room, { status: "disabled" }));

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("disabled");
  });
});

describe("PUT /api/rooms/:id — capacity-decrease race safety (NFR-PERF-06)", () => {
  it("never leaves a pending booking exceeding the room's final capacity, even racing against a new booking", async () => {
    const room = await createRoom({ capacity: 10 });
    const employee = await createEmployee();

    await Promise.all([
      request(app)
        .post("/api/bookings")
        .send({
          roomId: room.id,
          employeeId: employee.id,
          title: "แข่งกับการลด Capacity",
          attendeeCount: 8,
          date: FUTURE_MONDAY,
          startTime: "09:00",
          endTime: "10:00",
        }),
      request(app).put(`/api/rooms/${room.id}`).send(putPayload(room, { capacity: 5 })),
    ]);

    const stored = await prisma.room.findUniqueOrThrow({ where: { id: room.id } });
    const pendingBookings = await prisma.booking.findMany({
      where: { roomId: room.id, status: "confirmed", endAt: { gt: new Date() } },
    });
    for (const booking of pendingBookings) {
      expect(booking.attendeeCount).toBeLessThanOrEqual(stored.capacity);
    }
  });
});

describe("DELETE /api/rooms/:id — pending-booking protection (FR-ROOM-06)", () => {
  it("returns 404 for a room that does not exist", async () => {
    const response = await request(app).delete("/api/rooms/does-not-exist");
    expect(response.status).toBe(404);
    expect(response.body.error).toBe("room_not_found");
  });

  it("deletes a room with no bookings at all", async () => {
    const room = await createRoom();

    const response = await request(app).delete(`/api/rooms/${room.id}`);

    expect(response.status).toBe(204);
    const stored = await prisma.room.findUnique({ where: { id: room.id } });
    expect(stored).toBeNull();
  });

  it("rejects deleting a room with a pending confirmed booking, reporting the count", async () => {
    const room = await createRoom();
    const employee = await createEmployee();
    await createBooking(room.id, employee.id, { startTime: "09:00", endTime: "10:00" });
    await createBooking(room.id, employee.id, { startTime: "11:00", endTime: "12:00" });

    const response = await request(app).delete(`/api/rooms/${room.id}`);

    expect(response.status).toBe(409);
    expect(response.body.error).toBe("room_has_pending_bookings");
    expect(response.body.count).toBe(2);

    const stillThere = await prisma.room.findUnique({ where: { id: room.id } });
    expect(stillThere).not.toBeNull();
  });

  it("rejects deleting a room whose only booking is cancelled, without a 500 (history must be preserved)", async () => {
    const room = await createRoom();
    const employee = await createEmployee();
    const booking = await createBooking(room.id, employee.id);
    await request(app).post(`/api/bookings/${booking.id}/cancel`).send({ employeeId: employee.id });

    const response = await request(app).delete(`/api/rooms/${room.id}`);

    expect(response.status).toBe(409);
    expect(response.body.error).not.toBe("room_has_pending_bookings");

    const stillThere = await prisma.room.findUnique({ where: { id: room.id } });
    expect(stillThere).not.toBeNull();
  });

  it("rejects deleting a room whose only booking has already ended, without a 500 (history must be preserved)", async () => {
    const room = await createRoom();
    const employee = await createEmployee();
    await prisma.booking.create({
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

    const response = await request(app).delete(`/api/rooms/${room.id}`);

    expect(response.status).toBe(409);
    expect(response.body.error).not.toBe("room_has_pending_bookings");

    const stillThere = await prisma.room.findUnique({ where: { id: room.id } });
    expect(stillThere).not.toBeNull();
  });
});
