import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/prisma.js";
import { resetDb } from "./reset-db.js";

const app = createApp();

// Fixed dates so tests never depend on "today" — 2026-08-10 is a Monday
// (business hours open, per DEFAULT_BUSINESS_HOURS), 2026-08-15 a Saturday
// (closed).
const MONDAY = "2026-08-10";
const SATURDAY = "2026-08-15";

const validRoom = { name: "ห้องประชุมใหญ่", capacity: 20, building: "อาคาร A", floor: "3" };
const validEmployee = { firstName: "สมชาย", lastName: "ใจดี", department: "ฝ่ายบุคคล" };

beforeEach(async () => {
  await resetDb();
});

async function createRoom(overrides: Partial<typeof validRoom> = {}) {
  const response = await request(app)
    .post("/api/rooms")
    .send({ ...validRoom, ...overrides });
  return response.body as { id: string; name: string };
}

async function createEmployee() {
  const response = await request(app).post("/api/employees").send(validEmployee);
  return response.body as { id: string };
}

async function createBooking(roomId: string, employeeId: string, overrides: Record<string, unknown> = {}) {
  return prisma.booking.create({
    data: {
      roomId,
      employeeId,
      title: "ประชุมทีม",
      attendeeCount: 5,
      startAt: new Date(`${MONDAY}T09:00:00+07:00`),
      endAt: new Date(`${MONDAY}T10:00:00+07:00`),
      status: "confirmed",
      ...overrides,
    },
  });
}

describe("GET /api/rooms/available", () => {
  it("excludes rooms with capacity below the requested attendee count", async () => {
    await createRoom({ name: "ห้องเล็ก", capacity: 4 });
    await createRoom({ name: "ห้องใหญ่", capacity: 20 });

    const response = await request(app).get("/api/rooms/available").query({
      date: MONDAY,
      startTime: "09:00",
      endTime: "10:00",
      attendeeCount: 10,
    });

    expect(response.status).toBe(200);
    const names = response.body.map((room: { name: string }) => room.name);
    expect(names).toEqual(["ห้องใหญ่"]);
  });

  it("filters by building and floor", async () => {
    await createRoom({ name: "A3", building: "อาคาร A", floor: "3" });
    await createRoom({ name: "B3", building: "อาคาร B", floor: "3" });
    await createRoom({ name: "A5", building: "อาคาร A", floor: "5" });

    const response = await request(app).get("/api/rooms/available").query({
      date: MONDAY,
      startTime: "09:00",
      endTime: "10:00",
      attendeeCount: 1,
      building: "อาคาร A",
      floor: "3",
    });

    expect(response.status).toBe(200);
    expect(response.body.map((room: { name: string }) => room.name)).toEqual(["A3"]);
  });

  it("excludes rooms disabled by an admin", async () => {
    const room = await createRoom();
    await prisma.room.update({ where: { id: room.id }, data: { status: "disabled" } });

    const response = await request(app).get("/api/rooms/available").query({
      date: MONDAY,
      startTime: "09:00",
      endTime: "10:00",
      attendeeCount: 1,
    });

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(0);
  });

  it("excludes a room with a confirmed booking overlapping the requested time", async () => {
    const room = await createRoom();
    const employee = await createEmployee();
    await createBooking(room.id, employee.id, {
      startAt: new Date(`${MONDAY}T09:00:00+07:00`),
      endAt: new Date(`${MONDAY}T10:00:00+07:00`),
    });

    const response = await request(app).get("/api/rooms/available").query({
      date: MONDAY,
      startTime: "09:30",
      endTime: "10:30",
      attendeeCount: 1,
    });

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(0);
  });

  it("does not exclude a room whose existing booking ends exactly when the search starts", async () => {
    const room = await createRoom();
    const employee = await createEmployee();
    await createBooking(room.id, employee.id, {
      startAt: new Date(`${MONDAY}T09:00:00+07:00`),
      endAt: new Date(`${MONDAY}T10:00:00+07:00`),
    });

    const response = await request(app).get("/api/rooms/available").query({
      date: MONDAY,
      startTime: "10:00",
      endTime: "11:00",
      attendeeCount: 1,
    });

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
  });

  it("does not let a cancelled booking block the room", async () => {
    const room = await createRoom();
    const employee = await createEmployee();
    await createBooking(room.id, employee.id, { status: "cancelled" });

    const response = await request(app).get("/api/rooms/available").query({
      date: MONDAY,
      startTime: "09:00",
      endTime: "10:00",
      attendeeCount: 1,
    });

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
  });

  it("rejects a time range outside business hours with the day's allowed hours", async () => {
    await createRoom();

    const response = await request(app).get("/api/rooms/available").query({
      date: MONDAY,
      startTime: "07:00",
      endTime: "09:00",
      attendeeCount: 1,
    });

    expect(response.status).toBe(409);
    expect(response.body.error).toBe("outside_business_hours");
    expect(response.body.businessHours).toMatchObject({
      dayOfWeek: 1,
      openTime: "08:00",
      closeTime: "18:00",
      isOpen: true,
    });
  });

  it("rejects a search on a closed day", async () => {
    await createRoom();

    const response = await request(app).get("/api/rooms/available").query({
      date: SATURDAY,
      startTime: "09:00",
      endTime: "10:00",
      attendeeCount: 1,
    });

    expect(response.status).toBe(409);
    expect(response.body.error).toBe("outside_business_hours");
    expect(response.body.businessHours).toMatchObject({ dayOfWeek: 6, isOpen: false });
  });

  it("rejects a malformed date", async () => {
    const response = await request(app).get("/api/rooms/available").query({
      date: "10-08-2026",
      startTime: "09:00",
      endTime: "10:00",
      attendeeCount: 1,
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("validation_error");
  });

  it("rejects a calendar-invalid date", async () => {
    const response = await request(app).get("/api/rooms/available").query({
      date: "2026-02-30",
      startTime: "09:00",
      endTime: "10:00",
      attendeeCount: 1,
    });

    expect(response.status).toBe(400);
  });

  it("rejects an end time that is not after the start time", async () => {
    const response = await request(app).get("/api/rooms/available").query({
      date: MONDAY,
      startTime: "10:00",
      endTime: "09:00",
      attendeeCount: 1,
    });

    expect(response.status).toBe(400);
    const fields = response.body.fields.map((f: { field: string }) => f.field);
    expect(fields).toContain("endTime");
  });

  it("rejects a missing attendee count", async () => {
    const response = await request(app).get("/api/rooms/available").query({
      date: MONDAY,
      startTime: "09:00",
      endTime: "10:00",
    });

    expect(response.status).toBe(400);
  });
});
