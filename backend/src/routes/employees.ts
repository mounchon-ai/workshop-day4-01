import { Router } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../prisma.js";
import { employeeInputSchema } from "../schemas/employee.js";
import { parseBody } from "../validation.js";

export const employeesRouter = Router();

const DUPLICATE_MESSAGE = "มีพนักงานชื่อและนามสกุลนี้อยู่แล้ว ยืนยันอีกครั้งเพื่อบันทึกต่อ";

class DuplicateEmployeeNameError extends Error {}

class EmployeeNotFoundError extends Error {}

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

// No `status` filter here, deliberately (ticket 12): a disabled employee
// still exists and can still own bookings, so a name shared with one is
// just as ambiguous for an admin picking from the list as a duplicate
// between two active employees would be.
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
    const { firstName, lastName, department, confirmDuplicate, status } = parsed.data;

    const employee = await prisma.$transaction(async (tx) => {
      if (!confirmDuplicate) {
        const duplicate = await findDuplicateName(tx, firstName, lastName, req.params.id);
        if (duplicate) {
          throw new DuplicateEmployeeNameError();
        }
      }
      return tx.employee.update({
        where: { id: req.params.id },
        data: { firstName, lastName, department, status },
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

// PDPA erasure-on-request (NFR-PDPA-05, 30-day deadline; issue 12; SDS
// §5.5 documents the order this must happen in: null out employeeId/title
// on every Booking this employee owns — past AND future — THEN delete the
// Employee row, never the reverse (the FK would otherwise block the delete
// while any Booking still points to it). Both steps run in one transaction
// so a crash between them can never leave a booking half-anonymized with
// its owner already gone.
//
// BookingAudit.actorEmployeeId is deliberately NOT touched here — per its
// own schema comment it's a non-FK snapshot designed to survive
// independently of the Employee row, serving as an accountability/audit
// log rather than user-facing booking data. This ticket's checklist only
// names Booking.employee_id/title; audit-row retention is ticket 14's
// concern (the scheduled PDPA retention job), not this on-request flow.
employeesRouter.post("/api/employees/:id/erasure", async (req, res, next) => {
  try {
    const count = await prisma.$transaction(async (tx) => {
      const employee = await tx.employee.findUnique({ where: { id: req.params.id } });
      if (!employee) {
        throw new EmployeeNotFoundError();
      }

      const { count } = await tx.booking.updateMany({
        where: { employeeId: req.params.id },
        data: { employeeId: null, title: null },
      });

      await tx.employee.delete({ where: { id: req.params.id } });

      return count;
    });

    res.status(200).json({ count });
  } catch (err) {
    if (err instanceof EmployeeNotFoundError) {
      res.status(404).json({ error: "employee_not_found" });
      return;
    }
    next(err);
  }
});
