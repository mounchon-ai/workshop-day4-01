import { Router } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../prisma.js";
import { employeeInputSchema } from "../schemas/employee.js";
import { parseBody } from "../validation.js";

export const employeesRouter = Router();

const DUPLICATE_MESSAGE = "มีพนักงานชื่อและนามสกุลนี้อยู่แล้ว ยืนยันอีกครั้งเพื่อบันทึกต่อ";

class DuplicateEmployeeNameError extends Error {}

employeesRouter.get("/api/employees", async (req, res, next) => {
  try {
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";

    const employees = await prisma.employee.findMany({
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    });

    // Filtered in application code rather than a SQL LIKE/contains: Prisma's
    // `contains` on SQLite has no way to escape `%`/`_`, so a search term
    // containing them would be (mis)interpreted as SQL wildcards. At the
    // documented scale (~300 employees, ASM-03) filtering in memory is
    // simpler than hand-escaping LIKE patterns and behaves predictably for
    // any input.
    const filtered = search
      ? employees.filter(
          (employee) => employee.firstName.includes(search) || employee.lastName.includes(search),
        )
      : employees;

    res.status(200).json(filtered);
  } catch (err) {
    next(err);
  }
});

// No `status` filter here: ticket 03 has no disable feature yet, so every
// row is active and a status filter would be untested. Ticket 12 introduces
// disable and should decide deliberately whether disabled employees still
// count toward this duplicate check.
async function findDuplicateName(
  client: Prisma.TransactionClient,
  firstName: string,
  lastName: string,
  excludeId?: string,
) {
  return client.employee.findFirst({
    where: {
      firstName,
      lastName,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
  });
}

employeesRouter.post("/api/employees", async (req, res, next) => {
  const parsed = parseBody(employeeInputSchema, req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "validation_error", fields: parsed.errors });
    return;
  }

  try {
    const { firstName, lastName, department, confirmDuplicate } = parsed.data;

    // Check-then-create runs inside one transaction so a second, concurrent
    // request can't slip a duplicate row in between the check and the write.
    const employee = await prisma.$transaction(async (tx) => {
      if (!confirmDuplicate) {
        const duplicate = await findDuplicateName(tx, firstName, lastName);
        if (duplicate) {
          throw new DuplicateEmployeeNameError();
        }
      }
      return tx.employee.create({ data: { firstName, lastName, department } });
    });

    res.status(201).json(employee);
  } catch (err) {
    if (err instanceof DuplicateEmployeeNameError) {
      res.status(409).json({
        error: "duplicate_employee_name",
        message: DUPLICATE_MESSAGE,
        requiresConfirmation: true,
      });
      return;
    }
    next(err);
  }
});

employeesRouter.put("/api/employees/:id", async (req, res, next) => {
  const parsed = parseBody(employeeInputSchema, req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "validation_error", fields: parsed.errors });
    return;
  }

  try {
    const { firstName, lastName, department, confirmDuplicate } = parsed.data;

    const employee = await prisma.$transaction(async (tx) => {
      if (!confirmDuplicate) {
        const duplicate = await findDuplicateName(tx, firstName, lastName, req.params.id);
        if (duplicate) {
          throw new DuplicateEmployeeNameError();
        }
      }
      return tx.employee.update({
        where: { id: req.params.id },
        data: { firstName, lastName, department },
      });
    });

    res.status(200).json(employee);
  } catch (err) {
    if (err instanceof DuplicateEmployeeNameError) {
      res.status(409).json({
        error: "duplicate_employee_name",
        message: DUPLICATE_MESSAGE,
        requiresConfirmation: true,
      });
      return;
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      res.status(404).json({ error: "employee_not_found" });
      return;
    }
    next(err);
  }
});
