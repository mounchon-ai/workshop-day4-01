import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { resetDb } from "./reset-db.js";

const app = createApp();

const validRoom = {
  name: "ห้องประชุมใหญ่",
  capacity: 20,
  building: "อาคาร A",
  floor: "3",
};

beforeEach(async () => {
  await resetDb();
});

describe("GET /api/rooms", () => {
  it("lists all rooms with name, capacity, building, and floor", async () => {
    await request(app).post("/api/rooms").send(validRoom);
    await request(app)
      .post("/api/rooms")
      .send({ ...validRoom, name: "ห้องประชุมเล็ก", capacity: 4 });

    const response = await request(app).get("/api/rooms");

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(2);
    const names = response.body.map((room: { name: string }) => room.name);
    expect(names).toEqual(expect.arrayContaining(["ห้องประชุมใหญ่", "ห้องประชุมเล็ก"]));
    expect(response.body[0]).toMatchObject({
      name: expect.any(String),
      capacity: expect.any(Number),
      building: expect.any(String),
      floor: expect.any(String),
    });
  });
});

describe("POST /api/rooms", () => {
  it("adds a new room with name, capacity, building, and floor", async () => {
    const response = await request(app).post("/api/rooms").send(validRoom);

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject(validRoom);
  });

  it("rejects a room with capacity 0 or negative", async () => {
    const response = await request(app)
      .post("/api/rooms")
      .send({ ...validRoom, capacity: 0 });

    expect(response.status).toBe(400);
    expect(response.body.fields).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: "capacity" })]),
    );
  });

  it("rejects a room with a non-integer capacity", async () => {
    const response = await request(app)
      .post("/api/rooms")
      .send({ ...validRoom, capacity: 4.5 });

    expect(response.status).toBe(400);
    expect(response.body.fields).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: "capacity" })]),
    );
  });

  it("rejects missing required fields and names which field failed", async () => {
    const response = await request(app)
      .post("/api/rooms")
      .send({ name: "", capacity: 10, building: "", floor: "1" });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("validation_error");
    const fields = response.body.fields.map((f: { field: string }) => f.field);
    expect(fields).toEqual(expect.arrayContaining(["name", "building"]));
  });

  it("rejects a completely missing field with a Thai message, not zod's raw type error", async () => {
    const response = await request(app)
      .post("/api/rooms")
      .send({ name: "ห้องประชุมใหญ่", building: "อาคาร A", floor: "3" });

    expect(response.status).toBe(400);
    const capacityError = response.body.fields.find(
      (f: { field: string }) => f.field === "capacity",
    );
    expect(capacityError.message).toBe("Capacity ต้องเป็นตัวเลข");
  });

  it("rejects a duplicate room name", async () => {
    await request(app).post("/api/rooms").send(validRoom);

    const response = await request(app).post("/api/rooms").send(validRoom);

    expect(response.status).toBe(409);
    expect(response.body.error).toBe("duplicate_room_name");
  });
});

describe("PUT /api/rooms/:id", () => {
  it("edits an existing room's name, capacity, building, and floor", async () => {
    const created = await request(app).post("/api/rooms").send(validRoom);

    const response = await request(app)
      .put(`/api/rooms/${created.body.id}`)
      .send({ name: "ห้องประชุมใหญ่ (ปรับปรุง)", capacity: 25, building: "อาคาร B", floor: "5" });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      name: "ห้องประชุมใหญ่ (ปรับปรุง)",
      capacity: 25,
      building: "อาคาร B",
      floor: "5",
    });
  });

  it("rejects renaming a room to a name already used by another room", async () => {
    await request(app).post("/api/rooms").send(validRoom);
    const other = await request(app)
      .post("/api/rooms")
      .send({ ...validRoom, name: "ห้องประชุมเล็ก" });

    const response = await request(app)
      .put(`/api/rooms/${other.body.id}`)
      .send({ ...validRoom, name: "ห้องประชุมใหญ่" });

    expect(response.status).toBe(409);
    expect(response.body.error).toBe("duplicate_room_name");
  });

  it("allows keeping a room's own name unchanged", async () => {
    const created = await request(app).post("/api/rooms").send(validRoom);

    const response = await request(app)
      .put(`/api/rooms/${created.body.id}`)
      .send({ ...validRoom, capacity: 30 });

    expect(response.status).toBe(200);
    expect(response.body.capacity).toBe(30);
  });
});
