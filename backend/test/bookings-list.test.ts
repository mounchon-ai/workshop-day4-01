import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/prisma.js";
import { resetDb } from "./reset-db.js";

const app = createApp();

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
  return response.body as { id: string; firstName: string; lastName: string };
}

async function seedBooking(
  roomId: string,
  employeeId: string,
  overrides: Record<string, unknown> = {},
) {
  return prisma.booking.create({
    data: {
      roomId,
      employeeId,
      title: "ประชุมทีม",
      attendeeCount: 5,
      startAt: new Date("2026-06-01T09:00:00+07:00"),
      endAt: new Date("2026-06-01T10:00:00+07:00"),
      status: "confirmed",
      ...overrides,
    },
  });
}

describe("GET /api/bookings?employeeId=", () => {
  it("returns only the selected employee's bookings", async () => {
    const room = await createRoom();
    const owner = await createEmployee();
    const other = await createEmployee({ firstName: "วิภา", lastName: "สุขใจ" });
    await seedBooking(room.id, owner.id, { title: "ของฉัน" });
    await seedBooking(room.id, other.id, { title: "ของคนอื่น" });

    const response = await request(app).get("/api/bookings").query({ employeeId: owner.id });

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0].title).toBe("ของฉัน");
  });

  it("returns bookings sorted by start time, newest first", async () => {
    const room = await createRoom();
    const employee = await createEmployee();
    // Inserted out of order deliberately so a pass-by-coincidence sort
    // (e.g. by createdAt or insertion order) would fail this assertion.
    await seedBooking(room.id, employee.id, {
      title: "กลาง",
      startAt: new Date("2026-06-02T09:00:00+07:00"),
      endAt: new Date("2026-06-02T10:00:00+07:00"),
    });
    await seedBooking(room.id, employee.id, {
      title: "ล่าสุด",
      startAt: new Date("2026-06-03T09:00:00+07:00"),
      endAt: new Date("2026-06-03T10:00:00+07:00"),
    });
    await seedBooking(room.id, employee.id, {
      title: "เก่าสุด",
      startAt: new Date("2026-06-01T09:00:00+07:00"),
      endAt: new Date("2026-06-01T10:00:00+07:00"),
    });

    const response = await request(app).get("/api/bookings").query({ employeeId: employee.id });

    expect(response.status).toBe(200);
    expect(response.body.map((b: { title: string }) => b.title)).toEqual([
      "ล่าสุด",
      "กลาง",
      "เก่าสุด",
    ]);
  });

  it("returns an empty array for an employee with no bookings", async () => {
    const employee = await createEmployee();

    const response = await request(app).get("/api/bookings").query({ employeeId: employee.id });

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });

  it("includes full room and employee detail on each item", async () => {
    const room = await createRoom();
    const employee = await createEmployee();
    await seedBooking(room.id, employee.id);

    const response = await request(app).get("/api/bookings").query({ employeeId: employee.id });

    expect(response.body[0]).toMatchObject({
      room: { id: room.id, name: validRoom.name },
      employee: { id: employee.id, firstName: employee.firstName },
    });
  });

  it("rejects a call with no employeeId, rather than dumping every booking", async () => {
    const room = await createRoom();
    const employee = await createEmployee();
    await seedBooking(room.id, employee.id);

    const response = await request(app).get("/api/bookings");

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("validation_error");
  });

  it("rejects an explicitly empty employeeId the same way as an omitted one", async () => {
    const response = await request(app).get("/api/bookings").query({ employeeId: "" });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("validation_error");
  });

  it("rejects building/floor supplied alongside employeeId (only meaningful with date)", async () => {
    const employee = await createEmployee();

    const response = await request(app)
      .get("/api/bookings")
      .query({ employeeId: employee.id, building: "อาคาร A" });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("validation_error");
  });
});

describe("GET /api/bookings/:id", () => {
  it("returns full detail for one booking", async () => {
    const room = await createRoom();
    const employee = await createEmployee();
    const booking = await seedBooking(room.id, employee.id, {
      title: "ประชุมทีมขาย",
      attendeeCount: 7,
    });

    const response = await request(app).get(`/api/bookings/${booking.id}`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id: booking.id,
      title: "ประชุมทีมขาย",
      attendeeCount: 7,
      status: "confirmed",
      room: { id: room.id },
      employee: { id: employee.id },
    });
  });

  it("returns 404 for a booking that does not exist", async () => {
    const response = await request(app).get("/api/bookings/does-not-exist");

    expect(response.status).toBe(404);
    expect(response.body.error).toBe("booking_not_found");
  });
});
