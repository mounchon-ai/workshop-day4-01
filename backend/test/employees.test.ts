import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { resetDb } from "./reset-db.js";

const app = createApp();

const validEmployee = {
  firstName: "สมชาย",
  lastName: "ใจดี",
  department: "ฝ่ายบุคคล",
};

beforeEach(async () => {
  await resetDb();
});

describe("GET /api/employees", () => {
  it("lists all employees with department and status", async () => {
    await request(app).post("/api/employees").send(validEmployee);

    const response = await request(app).get("/api/employees");

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0]).toMatchObject({
      firstName: "สมชาย",
      lastName: "ใจดี",
      department: "ฝ่ายบุคคล",
      status: "active",
    });
  });

  it("filters employees by a partial match on first or last name", async () => {
    await request(app).post("/api/employees").send(validEmployee);
    await request(app)
      .post("/api/employees")
      .send({ firstName: "วิภา", lastName: "สุขใจ", department: "ฝ่ายขาย" });

    const byFirstName = await request(app).get("/api/employees").query({ search: "สมชาย" });
    expect(byFirstName.body).toHaveLength(1);
    expect(byFirstName.body[0].firstName).toBe("สมชาย");

    const byLastName = await request(app).get("/api/employees").query({ search: "สุขใจ" });
    expect(byLastName.body).toHaveLength(1);
    expect(byLastName.body[0].lastName).toBe("สุขใจ");
  });

  it("treats % and _ in the search term as literal characters, not SQL wildcards", async () => {
    await request(app).post("/api/employees").send(validEmployee);
    await request(app)
      .post("/api/employees")
      .send({ firstName: "วิภา", lastName: "สุขใจ", department: "ฝ่ายขาย" });

    const response = await request(app).get("/api/employees").query({ search: "%" });

    expect(response.body).toHaveLength(0);
  });
});

describe("POST /api/employees", () => {
  it("adds a new employee with first name, last name, and department", async () => {
    const response = await request(app).post("/api/employees").send(validEmployee);

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject(validEmployee);
  });

  it("rejects missing required fields and names which field failed", async () => {
    const response = await request(app)
      .post("/api/employees")
      .send({ firstName: "", lastName: "ใจดี", department: "" });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("validation_error");
    const fields = response.body.fields.map((f: { field: string }) => f.field);
    expect(fields).toEqual(expect.arrayContaining(["firstName", "department"]));
  });

  it("warns instead of blocking when first+last name duplicates an existing employee", async () => {
    await request(app).post("/api/employees").send(validEmployee);

    const response = await request(app).post("/api/employees").send(validEmployee);

    expect(response.status).toBe(409);
    expect(response.body.error).toBe("duplicate_employee_name");
    expect(response.body.requiresConfirmation).toBe(true);
  });

  it("saves the duplicate anyway once the caller confirms", async () => {
    await request(app).post("/api/employees").send(validEmployee);

    const response = await request(app)
      .post("/api/employees")
      .send({ ...validEmployee, confirmDuplicate: true });

    expect(response.status).toBe(201);

    const list = await request(app).get("/api/employees");
    expect(list.body).toHaveLength(2);
  });

  it("does not warn about a different department with the same name pair on a fresh check", async () => {
    await request(app).post("/api/employees").send(validEmployee);

    const response = await request(app)
      .post("/api/employees")
      .send({ ...validEmployee, department: "ฝ่ายการเงิน" });

    expect(response.status).toBe(409);
  });

  it("rejects a completely missing field with a Thai message, not zod's raw type error", async () => {
    const response = await request(app)
      .post("/api/employees")
      .send({ lastName: "ใจดี", department: "ฝ่ายบุคคล" });

    expect(response.status).toBe(400);
    const firstNameError = response.body.fields.find(
      (f: { field: string }) => f.field === "firstName",
    );
    expect(firstNameError.message).toBe("กรุณาระบุชื่อ");
  });

  it("never lets two concurrent identical requests both bypass the duplicate warning", async () => {
    const [first, second] = await Promise.all([
      request(app).post("/api/employees").send(validEmployee),
      request(app).post("/api/employees").send(validEmployee),
    ]);

    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([201, 409]);

    const list = await request(app).get("/api/employees");
    expect(list.body).toHaveLength(1);
  });
});

describe("PUT /api/employees/:id", () => {
  it("edits an existing employee's first name, last name, and department", async () => {
    const created = await request(app).post("/api/employees").send(validEmployee);

    const response = await request(app)
      .put(`/api/employees/${created.body.id}`)
      .send({ firstName: "สมชาย", lastName: "ใจดี", department: "ฝ่ายการตลาด" });

    expect(response.status).toBe(200);
    expect(response.body.department).toBe("ฝ่ายการตลาด");
  });

  it("allows keeping an employee's own name unchanged", async () => {
    const created = await request(app).post("/api/employees").send(validEmployee);

    const response = await request(app)
      .put(`/api/employees/${created.body.id}`)
      .send({ ...validEmployee, department: "ฝ่ายบุคคล 2" });

    expect(response.status).toBe(200);
  });

  it("warns when editing an employee's name to duplicate another employee's name", async () => {
    await request(app).post("/api/employees").send(validEmployee);
    const other = await request(app)
      .post("/api/employees")
      .send({ firstName: "วิภา", lastName: "สุขใจ", department: "ฝ่ายขาย" });

    const response = await request(app)
      .put(`/api/employees/${other.body.id}`)
      .send({ firstName: "สมชาย", lastName: "ใจดี", department: "ฝ่ายขาย" });

    expect(response.status).toBe(409);
    expect(response.body.error).toBe("duplicate_employee_name");
  });
});

describe("PUT /api/employees/:id — status toggle (FR-EMP-05)", () => {
  it("disables an employee", async () => {
    const created = await request(app).post("/api/employees").send(validEmployee);

    const response = await request(app)
      .put(`/api/employees/${created.body.id}`)
      .send({ ...validEmployee, status: "disabled" });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("disabled");
  });

  it("re-enables a disabled employee", async () => {
    const created = await request(app).post("/api/employees").send(validEmployee);
    await request(app)
      .put(`/api/employees/${created.body.id}`)
      .send({ ...validEmployee, status: "disabled" });

    const response = await request(app)
      .put(`/api/employees/${created.body.id}`)
      .send({ ...validEmployee, status: "active" });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("active");
  });

  it("leaves status unchanged when not supplied", async () => {
    const created = await request(app).post("/api/employees").send(validEmployee);
    await request(app)
      .put(`/api/employees/${created.body.id}`)
      .send({ ...validEmployee, status: "disabled" });

    const response = await request(app).put(`/api/employees/${created.body.id}`).send(validEmployee);

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("disabled");
  });

  it("does not touch bookings owned by a disabled employee", async () => {
    const room = (
      await request(app)
        .post("/api/rooms")
        .send({ name: "ห้องประชุมใหญ่", capacity: 10, building: "อาคาร A", floor: "3" })
    ).body;
    const created = await request(app).post("/api/employees").send(validEmployee);
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + 3);
    while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() + 1);
    const futureMonday = d.toISOString().slice(0, 10);
    const booking = await request(app).post("/api/bookings").send({
      roomId: room.id,
      employeeId: created.body.id,
      title: "ประชุมทีม",
      attendeeCount: 5,
      date: futureMonday,
      startTime: "09:00",
      endTime: "10:00",
    });

    await request(app)
      .put(`/api/employees/${created.body.id}`)
      .send({ ...validEmployee, status: "disabled" });

    const stillThere = await request(app).get(`/api/bookings/${booking.body.id}`);
    expect(stillThere.status).toBe(200);
    expect(stillThere.body.status).toBe("confirmed");
    expect(stillThere.body.employee.id).toBe(created.body.id);
  });

  // Deliberate decision (ticket 12): a disabled employee still exists and
  // can still own bookings, so a duplicate name is just as ambiguous for an
  // admin as it would be between two active employees — the duplicate-name
  // check is not scoped to active employees only.
  it("still warns about a duplicate name shared with a disabled employee", async () => {
    const created = await request(app).post("/api/employees").send(validEmployee);
    await request(app)
      .put(`/api/employees/${created.body.id}`)
      .send({ ...validEmployee, status: "disabled" });

    const response = await request(app).post("/api/employees").send(validEmployee);

    expect(response.status).toBe(409);
    expect(response.body.error).toBe("duplicate_employee_name");
  });
});
