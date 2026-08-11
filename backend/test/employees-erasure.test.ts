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
  return response.body as { id: string };
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
  return response.body as { id: string };
}

describe("POST /api/employees/:id/erasure — validity", () => {
  it("returns 404 for an employee that does not exist", async () => {
    const response = await request(app).post("/api/employees/does-not-exist/erasure");

    expect(response.status).toBe(404);
    expect(response.body.error).toBe("employee_not_found");
  });

  it("succeeds with count 0 for an employee with no bookings at all", async () => {
    const employee = await createEmployee();

    const response = await request(app).post(`/api/employees/${employee.id}/erasure`);

    expect(response.status).toBe(200);
    expect(response.body.count).toBe(0);

    const stored = await prisma.employee.findUnique({ where: { id: employee.id } });
    expect(stored).toBeNull();
  });

  it("returns 404 on a repeat erasure of the same employee (row is already gone)", async () => {
    const employee = await createEmployee();
    await request(app).post(`/api/employees/${employee.id}/erasure`);

    const response = await request(app).post(`/api/employees/${employee.id}/erasure`);

    expect(response.status).toBe(404);
    expect(response.body.error).toBe("employee_not_found");
  });
});

describe("POST /api/employees/:id/erasure — anonymizes bookings, past and future", () => {
  it("nulls employeeId and title on every booking the employee owns, then deletes the employee row", async () => {
    const room = await createRoom();
    const employee = await createEmployee();
    const futureBooking = await createBooking(room.id, employee.id, {
      title: "ประชุมอนาคต",
      startTime: "09:00",
      endTime: "10:00",
    });
    const pastBooking = await prisma.booking.create({
      data: {
        roomId: room.id,
        employeeId: employee.id,
        title: "ประชุมอดีต",
        attendeeCount: 4,
        startAt: new Date("2020-01-06T09:00:00+07:00"),
        endAt: new Date("2020-01-06T10:00:00+07:00"),
        status: "completed",
      },
    });

    const response = await request(app).post(`/api/employees/${employee.id}/erasure`);

    expect(response.status).toBe(200);
    expect(response.body.count).toBe(2);

    const stored = await prisma.employee.findUnique({ where: { id: employee.id } });
    expect(stored).toBeNull();

    for (const bookingId of [futureBooking.id, pastBooking.id]) {
      const booking = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
      expect(booking.employeeId).toBeNull();
      expect(booking.title).toBeNull();
      // Anonymous-statistics fields (NFR-PDPA-07) must survive untouched.
      expect(booking.roomId).toBe(room.id);
      expect(booking.attendeeCount).toBeGreaterThan(0);
    }
  });

  it("still exposes room, time range, and attendeeCount for an erased booking via the detail endpoint", async () => {
    const room = await createRoom();
    const employee = await createEmployee();
    const booking = await createBooking(room.id, employee.id, { attendeeCount: 7 });

    await request(app).post(`/api/employees/${employee.id}/erasure`);

    const response = await request(app).get(`/api/bookings/${booking.id}`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id: booking.id,
      attendeeCount: 7,
      room: { id: room.id },
      employee: null,
      title: null,
    });
  });

  it("does not touch bookings belonging to a different employee", async () => {
    const room = await createRoom();
    const target = await createEmployee();
    const other = await createEmployee({ firstName: "วิภา", lastName: "สุขใจ" });
    const untouched = await createBooking(room.id, other.id, {
      title: "ไม่เกี่ยวข้อง",
      startTime: "11:00",
      endTime: "12:00",
    });

    await request(app).post(`/api/employees/${target.id}/erasure`);

    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: untouched.id } });
    expect(booking.employeeId).toBe(other.id);
    expect(booking.title).toBe("ไม่เกี่ยวข้อง");
  });

  it("leaves no dangling foreign key — the employee row and its bookings are both left in a valid state", async () => {
    const room = await createRoom();
    const employee = await createEmployee();
    await createBooking(room.id, employee.id);

    const response = await request(app).post(`/api/employees/${employee.id}/erasure`);
    expect(response.status).toBe(200);

    // Any query touching the FK (e.g. a fresh findMany with the relation
    // include) must not throw — a dangling/orphaned FK would surface here.
    const bookings = await prisma.booking.findMany({ where: { roomId: room.id }, include: { employee: true } });
    expect(bookings).toHaveLength(1);
    expect(bookings[0].employee).toBeNull();
  });
});

describe("POST /api/employees/:id/erasure — does not touch BookingAudit", () => {
  it("leaves the audit trail's actorEmployeeId snapshot intact (audit rows are out of scope for this ticket)", async () => {
    const room = await createRoom();
    const employee = await createEmployee();
    const booking = await createBooking(room.id, employee.id);

    await request(app).post(`/api/employees/${employee.id}/erasure`);

    const auditEntries = await prisma.bookingAudit.findMany({ where: { bookingId: booking.id } });
    expect(auditEntries).toHaveLength(1);
    expect(auditEntries[0].actorEmployeeId).toBe(employee.id);
  });
});

describe("Erased bookings cannot be managed by anyone afterward", () => {
  it("rejects editing an erased booking with 403 not_owner, for any submitted employeeId", async () => {
    const room = await createRoom();
    const employee = await createEmployee();
    const booking = await createBooking(room.id, employee.id);
    const otherEmployee = await createEmployee({ firstName: "วิภา", lastName: "สุขใจ" });

    await request(app).post(`/api/employees/${employee.id}/erasure`);

    const response = await request(app)
      .put(`/api/bookings/${booking.id}`)
      .send({
        roomId: room.id,
        employeeId: otherEmployee.id,
        title: "พยายามแก้ไข",
        attendeeCount: 4,
        date: FUTURE_MONDAY,
        startTime: "11:00",
        endTime: "12:00",
      });

    expect(response.status).toBe(403);
    expect(response.body.error).toBe("not_owner");
  });

  it("rejects cancelling an erased booking with 403 not_owner, for any submitted employeeId", async () => {
    const room = await createRoom();
    const employee = await createEmployee();
    const booking = await createBooking(room.id, employee.id);
    const otherEmployee = await createEmployee({ firstName: "วิภา", lastName: "สุขใจ" });

    await request(app).post(`/api/employees/${employee.id}/erasure`);

    const response = await request(app)
      .post(`/api/bookings/${booking.id}/cancel`)
      .send({ employeeId: otherEmployee.id });

    expect(response.status).toBe(403);
    expect(response.body.error).toBe("not_owner");
  });
});
