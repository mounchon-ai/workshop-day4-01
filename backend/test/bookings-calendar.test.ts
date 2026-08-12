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
  return response.body as { id: string; name: string };
}

async function createEmployee(overrides: Partial<typeof validEmployee> = {}) {
  const response = await request(app)
    .post("/api/employees")
    .send({ ...validEmployee, ...overrides });
  return response.body as { id: string };
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

describe("GET /api/bookings?date= — room usage calendar (FR-BKG-03)", () => {
  it("rejects a call with neither employeeId nor date", async () => {
    const response = await request(app).get("/api/bookings");
    expect(response.status).toBe(400);
    expect(response.body.error).toBe("validation_error");
  });

  it("rejects a call with both employeeId and date", async () => {
    const room = await createRoom();
    const employee = await createEmployee();
    await seedBooking(room.id, employee.id);

    const response = await request(app)
      .get("/api/bookings")
      .query({ employeeId: employee.id, date: "2026-06-01" });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("validation_error");
  });

  it("returns an empty array for a date with no bookings, not an error", async () => {
    const response = await request(app).get("/api/bookings").query({ date: "2026-06-01" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });

  it("only returns bookings that fall on the requested Bangkok calendar date", async () => {
    const room = await createRoom();
    const employee = await createEmployee();
    await seedBooking(room.id, employee.id, {
      title: "ตอนเช้า",
      startAt: new Date("2026-06-01T09:00:00+07:00"),
      endAt: new Date("2026-06-01T10:00:00+07:00"),
    });
    // Just before Bangkok midnight on 2026-06-01 — must still count as
    // 2026-06-01, not spill into 2026-06-02.
    await seedBooking(room.id, employee.id, {
      title: "ดึกๆ",
      startAt: new Date("2026-06-01T23:30:00+07:00"),
      endAt: new Date("2026-06-01T23:59:00+07:00"),
    });
    // Just after Bangkok midnight the next day — must not appear.
    await seedBooking(room.id, employee.id, {
      title: "วันถัดไป",
      startAt: new Date("2026-06-02T00:30:00+07:00"),
      endAt: new Date("2026-06-02T01:00:00+07:00"),
    });

    const response = await request(app).get("/api/bookings").query({ date: "2026-06-01" });

    expect(response.status).toBe(200);
    const titles = response.body.map((b: { title: string }) => b.title);
    expect(titles).toEqual(["ตอนเช้า", "ดึกๆ"]);
  });

  it("excludes cancelled bookings", async () => {
    const room = await createRoom();
    const employee = await createEmployee();
    await seedBooking(room.id, employee.id, { title: "ยกเลิกแล้ว", status: "cancelled" });
    await seedBooking(room.id, employee.id, { title: "ยืนยันแล้ว" });

    const response = await request(app).get("/api/bookings").query({ date: "2026-06-01" });

    expect(response.status).toBe(200);
    expect(response.body.map((b: { title: string }) => b.title)).toEqual(["ยืนยันแล้ว"]);
  });

  it("includes completed bookings", async () => {
    const room = await createRoom();
    const employee = await createEmployee();
    await seedBooking(room.id, employee.id, { title: "เสร็จสิ้นแล้ว", status: "completed" });

    const response = await request(app).get("/api/bookings").query({ date: "2026-06-01" });

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0].status).toBe("completed");
  });

  it("groups by room (name order) and sorts by start time within each room", async () => {
    const roomB = await createRoom({ name: "ห้อง B" });
    const roomA = await createRoom({ name: "ห้อง A" });
    const employee = await createEmployee();

    await seedBooking(roomB.id, employee.id, {
      title: "B ช่วงบ่าย",
      startAt: new Date("2026-06-01T13:00:00+07:00"),
      endAt: new Date("2026-06-01T14:00:00+07:00"),
    });
    await seedBooking(roomA.id, employee.id, {
      title: "A ช่วงบ่าย",
      startAt: new Date("2026-06-01T13:00:00+07:00"),
      endAt: new Date("2026-06-01T14:00:00+07:00"),
    });
    await seedBooking(roomA.id, employee.id, {
      title: "A ช่วงเช้า",
      startAt: new Date("2026-06-01T09:00:00+07:00"),
      endAt: new Date("2026-06-01T10:00:00+07:00"),
    });

    const response = await request(app).get("/api/bookings").query({ date: "2026-06-01" });

    expect(response.status).toBe(200);
    expect(response.body.map((b: { title: string }) => b.title)).toEqual([
      "A ช่วงเช้า",
      "A ช่วงบ่าย",
      "B ช่วงบ่าย",
    ]);
  });

  it("filters by building and floor", async () => {
    const roomMatch = await createRoom({ name: "ห้องตรง", building: "อาคาร A", floor: "3" });
    const roomOtherBuilding = await createRoom({ name: "ห้องอาคารอื่น", building: "อาคาร B", floor: "3" });
    const roomOtherFloor = await createRoom({ name: "ห้องชั้นอื่น", building: "อาคาร A", floor: "5" });
    const employee = await createEmployee();

    await seedBooking(roomMatch.id, employee.id, { title: "ตรงเงื่อนไข" });
    await seedBooking(roomOtherBuilding.id, employee.id, { title: "ผิดอาคาร" });
    await seedBooking(roomOtherFloor.id, employee.id, { title: "ผิดชั้น" });

    const response = await request(app)
      .get("/api/bookings")
      .query({ date: "2026-06-01", building: "อาคาร A", floor: "3" });

    expect(response.status).toBe(200);
    expect(response.body.map((b: { title: string }) => b.title)).toEqual(["ตรงเงื่อนไข"]);
  });

  it("filters by roomId (ticket 15: per-room calendar)", async () => {
    const roomMatch = await createRoom({ name: "ห้องตรง" });
    const roomOther = await createRoom({ name: "ห้องอื่น" });
    const employee = await createEmployee();

    await seedBooking(roomMatch.id, employee.id, { title: "ตรงห้อง" });
    await seedBooking(roomOther.id, employee.id, { title: "ห้องอื่น" });

    const response = await request(app)
      .get("/api/bookings")
      .query({ date: "2026-06-01", roomId: roomMatch.id });

    expect(response.status).toBe(200);
    expect(response.body.map((b: { title: string }) => b.title)).toEqual(["ตรงห้อง"]);
  });

  it("rejects roomId supplied alongside employeeId", async () => {
    const room = await createRoom();
    const employee = await createEmployee();
    await seedBooking(room.id, employee.id);

    const response = await request(app)
      .get("/api/bookings")
      .query({ employeeId: employee.id, roomId: room.id });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("validation_error");
  });

  it("includes full room and employee detail on each item", async () => {
    const room = await createRoom();
    const employee = await createEmployee();
    await seedBooking(room.id, employee.id);

    const response = await request(app).get("/api/bookings").query({ date: "2026-06-01" });

    expect(response.body[0]).toMatchObject({
      room: { id: room.id, name: room.name },
      employee: { id: employee.id },
    });
  });
});
