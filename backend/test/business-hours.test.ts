import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { resetDb } from "./reset-db.js";

const app = createApp();

beforeEach(async () => {
  await resetDb();
});

describe("GET /api/business-hours", () => {
  it("returns all 7 days with 08:00-18:00 default and Mon-Fri open, Sat-Sun closed", async () => {
    const response = await request(app).get("/api/business-hours");

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(7);

    const byDay = new Map(
      response.body.map((day: { dayOfWeek: number }) => [day.dayOfWeek, day]),
    );
    for (let dayOfWeek = 0; dayOfWeek <= 6; dayOfWeek++) {
      expect(byDay.get(dayOfWeek)).toMatchObject({
        dayOfWeek,
        openTime: "08:00",
        closeTime: "18:00",
        isOpen: dayOfWeek >= 1 && dayOfWeek <= 5,
      });
    }
  });
});

function fullWeekPayload(overrides: { dayOfWeek: number; [key: string]: unknown }[]) {
  const byDay = new Map(overrides.map((day) => [day.dayOfWeek, day]));
  return Array.from({ length: 7 }, (_, dayOfWeek) => ({
    dayOfWeek,
    openTime: "08:00",
    closeTime: "18:00",
    isOpen: dayOfWeek >= 1 && dayOfWeek <= 5,
    ...byDay.get(dayOfWeek),
  }));
}

describe("PUT /api/business-hours", () => {
  it("updates open time, close time, and open status for each day", async () => {
    const payload = fullWeekPayload([
      { dayOfWeek: 1, openTime: "09:00", closeTime: "17:00", isOpen: true },
      { dayOfWeek: 6, openTime: "10:00", closeTime: "14:00", isOpen: true },
    ]);

    const response = await request(app).put("/api/business-hours").send(payload);

    expect(response.status).toBe(200);
    const byDay = new Map(
      response.body.map((day: { dayOfWeek: number }) => [day.dayOfWeek, day]),
    );
    expect(byDay.get(1)).toMatchObject({ openTime: "09:00", closeTime: "17:00", isOpen: true });
    expect(byDay.get(6)).toMatchObject({ openTime: "10:00", closeTime: "14:00", isOpen: true });

    const getResponse = await request(app).get("/api/business-hours");
    const persisted = new Map(
      getResponse.body.map((day: { dayOfWeek: number }) => [day.dayOfWeek, day]),
    );
    expect(persisted.get(1)).toMatchObject({ openTime: "09:00", closeTime: "17:00" });
  });

  it("rejects a day where close time is not after open time", async () => {
    const payload = fullWeekPayload([{ dayOfWeek: 2, openTime: "18:00", closeTime: "08:00" }]);

    const response = await request(app).put("/api/business-hours").send(payload);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("validation_error");
    const fields = response.body.fields.map((f: { field: string }) => f.field);
    expect(fields.some((field: string) => field.endsWith("closeTime"))).toBe(true);
  });

  it("rejects equal open and close time", async () => {
    const payload = fullWeekPayload([{ dayOfWeek: 3, openTime: "08:00", closeTime: "08:00" }]);

    const response = await request(app).put("/api/business-hours").send(payload);

    expect(response.status).toBe(400);
  });

  it("rejects a payload missing one of the 7 days", async () => {
    const payload = fullWeekPayload([]).slice(0, 6);

    const response = await request(app).put("/api/business-hours").send(payload);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("validation_error");
  });

  it("rejects a malformed time string", async () => {
    const payload = fullWeekPayload([{ dayOfWeek: 4, openTime: "8:00", closeTime: "18:00" }]);

    const response = await request(app).put("/api/business-hours").send(payload);

    expect(response.status).toBe(400);
  });

  it("leaves existing values untouched when the update is rejected", async () => {
    const payload = fullWeekPayload([{ dayOfWeek: 5, openTime: "20:00", closeTime: "08:00" }]);

    const rejected = await request(app).put("/api/business-hours").send(payload);
    expect(rejected.status).toBe(400);

    const getResponse = await request(app).get("/api/business-hours");
    const persisted = new Map(
      getResponse.body.map((day: { dayOfWeek: number }) => [day.dayOfWeek, day]),
    );
    expect(persisted.get(5)).toMatchObject({ openTime: "08:00", closeTime: "18:00" });
  });
});
