import { Router } from "express";
import type { Prisma } from "@prisma/client";
import { prisma } from "../prisma.js";
import { bookingInputSchema } from "../schemas/booking.js";
import { bookingCancelSchema } from "../schemas/booking-cancel.js";
import { bookingListQuerySchema } from "../schemas/booking-list.js";
import { parseBody } from "../validation.js";
import { dayOfWeekForDate, toBangkokInstant } from "../bangkok-time.js";

export const bookingsRouter = Router();

const bookingInclude = { room: true, employee: true } as const;

type RejectionReason = { rule: string; message: string };

class BookingRejectedError extends Error {
  constructor(public reasons: RejectionReason[]) {
    super("booking_rejected");
  }
}

class AlreadyCancelledError extends Error {
  constructor(public booking: Prisma.BookingGetPayload<{ include: typeof bookingInclude }>) {
    super("already_cancelled");
  }
}

class BookingEndedError extends Error {
  constructor() {
    super("booking_ended");
  }
}

// IR-11/FR-BKG-10 (creation) and FR-BKG-13 (edit, same rule set): every
// failing rule in this tier — Business Hours, Capacity, Conflict — is
// collected and reported together, not just the first one encountered.
// Must run inside the caller's transaction (via `tx`), never the top-level
// `prisma` client — both the Capacity check's safety against a concurrent
// FR-ROOM-07 capacity decrease and the Conflict check's safety under
// concurrent requests (NFR-PERF-06) depend on every read happening inside
// the same transaction as the booking write, not on a value the caller
// looked up beforehand (room.capacity is read fresh here, not passed in,
// for exactly this reason — see rooms-protection.test.ts's race test).
async function evaluateBookingRules(
  tx: Prisma.TransactionClient,
  params: {
    roomId: string;
    attendeeCount: number;
    date: string;
    startTime: string;
    endTime: string;
    startAt: Date;
    endAt: Date;
    excludeBookingId?: string;
  },
): Promise<RejectionReason[]> {
  const businessHours = await tx.businessHours.findUniqueOrThrow({
    where: { dayOfWeek: dayOfWeekForDate(params.date) },
  });

  const reasons: RejectionReason[] = [];

  if (
    !businessHours.isOpen ||
    params.startTime < businessHours.openTime ||
    params.endTime > businessHours.closeTime
  ) {
    reasons.push({
      rule: "outside_business_hours",
      message: businessHours.isOpen
        ? `ช่วงเวลาที่ระบุอยู่นอกเวลาทำการ วันนี้เปิดทำการ ${businessHours.openTime}-${businessHours.closeTime}`
        : "วันที่เลือกเป็นวันหยุดทำการ ไม่เปิดให้จองห้องประชุม",
    });
  }

  const room = await tx.room.findUniqueOrThrow({ where: { id: params.roomId } });
  if (params.attendeeCount > room.capacity) {
    reasons.push({
      rule: "capacity_exceeded",
      message: `จำนวนผู้เข้าร่วมเกิน Capacity ของห้องนี้ (สูงสุด ${room.capacity} คน)`,
    });
  }

  const conflict = await tx.booking.findFirst({
    where: {
      roomId: params.roomId,
      status: "confirmed",
      startAt: { lt: params.endAt },
      endAt: { gt: params.startAt },
      ...(params.excludeBookingId ? { id: { not: params.excludeBookingId } } : {}),
    },
  });
  if (conflict) {
    reasons.push({
      rule: "conflict",
      message: "ช่วงเวลานี้ถูกจองไปแล้ว กรุณาเลือกช่วงเวลาอื่น",
    });
  }

  return reasons;
}

async function findActiveRoomAndEmployee(roomId: string, employeeId: string) {
  const [room, employee] = await Promise.all([
    prisma.room.findUnique({ where: { id: roomId } }),
    prisma.employee.findUnique({ where: { id: employeeId } }),
  ]);

  if (!room) {
    return { error: { status: 404 as const, body: { error: "room_not_found" } } };
  }
  // A disabled room/employee still exists (FR-ROOM-05/FR-EMP-05 keep their
  // booking history intact), it just can't be a target for new/edited
  // bookings — same as not found, from this endpoint's point of view.
  if (room.status !== "active") {
    return {
      error: { status: 404 as const, body: { error: "room_disabled", message: "ห้องนี้ถูกปิดการใช้งานแล้ว" } },
    };
  }

  if (!employee) {
    return { error: { status: 404 as const, body: { error: "employee_not_found" } } };
  }
  if (employee.status !== "active") {
    return {
      error: {
        status: 404 as const,
        body: { error: "employee_disabled", message: "พนักงานคนนี้ถูกปิดการใช้งานแล้ว" },
      },
    };
  }

  return { room, employee };
}

bookingsRouter.get("/api/bookings", async (req, res, next) => {
  const parsed = parseBody(bookingListQuerySchema, req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "validation_error", fields: parsed.errors });
    return;
  }

  try {
    if (parsed.data.employeeId) {
      const bookings = await prisma.booking.findMany({
        where: { employeeId: parsed.data.employeeId },
        orderBy: { startAt: "desc" },
        include: bookingInclude,
      });
      res.status(200).json(bookings);
      return;
    }

    // Room usage calendar (FR-BKG-03, ticket 10): the requested "date" is a
    // Bangkok wall-clock calendar day, so its instant range must go through
    // toBangkokInstant (never UTC midnight-to-midnight) — see FUTURE_MONDAY
    // helpers used across the booking tests for the same reasoning.
    const { date, building, floor } = parsed.data;
    // date is guaranteed present here — the schema's refine requires
    // exactly one of employeeId/date.
    const startOfDay = toBangkokInstant(date as string, "00:00");
    const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

    const bookings = await prisma.booking.findMany({
      where: {
        startAt: { gte: startOfDay, lt: endOfDay },
        status: { in: ["confirmed", "completed"] },
        room: {
          ...(building ? { building } : {}),
          ...(floor ? { floor } : {}),
        },
      },
      orderBy: [{ room: { name: "asc" } }, { startAt: "asc" }],
      include: bookingInclude,
    });
    res.status(200).json(bookings);
  } catch (err) {
    next(err);
  }
});

bookingsRouter.get("/api/bookings/:id", async (req, res, next) => {
  try {
    const booking = await prisma.booking.findUnique({
      where: { id: req.params.id },
      include: bookingInclude,
    });
    if (!booking) {
      res.status(404).json({ error: "booking_not_found" });
      return;
    }
    res.status(200).json(booking);
  } catch (err) {
    next(err);
  }
});

bookingsRouter.post("/api/bookings", async (req, res, next) => {
  const parsed = parseBody(bookingInputSchema, req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "validation_error", fields: parsed.errors });
    return;
  }

  const { roomId, employeeId, title, attendeeCount, date, startTime, endTime } = parsed.data;

  try {
    const found = await findActiveRoomAndEmployee(roomId, employeeId);
    if (found.error) {
      res.status(found.error.status).json(found.error.body);
      return;
    }

    const startAt = toBangkokInstant(date, startTime);
    const endAt = toBangkokInstant(date, endTime);

    const booking = await prisma.$transaction(async (tx) => {
      const reasons = await evaluateBookingRules(tx, {
        roomId,
        attendeeCount,
        date,
        startTime,
        endTime,
        startAt,
        endAt,
      });

      if (reasons.length > 0) {
        throw new BookingRejectedError(reasons);
      }

      const created = await tx.booking.create({
        data: { roomId, employeeId, title, attendeeCount, startAt, endAt, status: "confirmed" },
        include: bookingInclude,
      });

      await tx.bookingAudit.create({
        data: { bookingId: created.id, action: "create", actorEmployeeId: employeeId },
      });

      return created;
    });

    res.status(201).json(booking);
  } catch (err) {
    if (err instanceof BookingRejectedError) {
      res.status(409).json({ error: "booking_rejected", reasons: err.reasons });
      return;
    }
    next(err);
  }
});

bookingsRouter.put("/api/bookings/:id", async (req, res, next) => {
  const parsed = parseBody(bookingInputSchema, req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "validation_error", fields: parsed.errors });
    return;
  }

  const { roomId, employeeId, title, attendeeCount, date, startTime, endTime } = parsed.data;

  try {
    const existing = await prisma.booking.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      res.status(404).json({ error: "booking_not_found" });
      return;
    }

    // Ownership is checked before any rule about the *new* values being
    // submitted (business hours/capacity/conflict below), matching UC-03's
    // activity diagram (FR-BKG-12) — it only comes after schema validation
    // because employeeId, the claim being checked, has to be parsed out of
    // the body first; validation_error (400) here is a request-shape
    // problem, not a rule this booking's owner would ever fail.
    if (existing.employeeId !== employeeId) {
      res.status(403).json({ error: "not_owner", message: "แก้ไขได้เฉพาะเจ้าของ Booking เท่านั้น" });
      return;
    }

    // A cancelled booking has no path back to "confirmed" (DR-08's state
    // diagram) — a future endAt no longer implies it's editable once
    // cancellation makes this reachable, so this must be checked separately
    // from (and before) the endAt check below.
    if (existing.status === "cancelled") {
      res.status(409).json({
        error: "booking_cancelled",
        message: "Booking นี้ถูกยกเลิกไปแล้ว ไม่สามารถแก้ไขได้",
      });
      return;
    }

    if (existing.endAt.getTime() < Date.now()) {
      res.status(409).json({
        error: "booking_ended",
        message: "ไม่สามารถแก้ไข Booking ที่ผ่านไปแล้วได้",
      });
      return;
    }

    const found = await findActiveRoomAndEmployee(roomId, employeeId);
    if (found.error) {
      res.status(found.error.status).json(found.error.body);
      return;
    }

    const startAt = toBangkokInstant(date, startTime);
    const endAt = toBangkokInstant(date, endTime);

    const booking = await prisma.$transaction(async (tx) => {
      const reasons = await evaluateBookingRules(tx, {
        roomId,
        attendeeCount,
        date,
        startTime,
        endTime,
        startAt,
        endAt,
        excludeBookingId: existing.id,
      });

      if (reasons.length > 0) {
        throw new BookingRejectedError(reasons);
      }

      const updated = await tx.booking.update({
        where: { id: existing.id },
        data: { roomId, title, attendeeCount, startAt, endAt },
        include: bookingInclude,
      });

      await tx.bookingAudit.create({
        data: { bookingId: updated.id, action: "update", actorEmployeeId: employeeId },
      });

      return updated;
    });

    res.status(200).json(booking);
  } catch (err) {
    if (err instanceof BookingRejectedError) {
      res.status(409).json({ error: "booking_rejected", reasons: err.reasons });
      return;
    }
    next(err);
  }
});

// FR-BKG-14/15/16, UC-04: cancellation only ever flips status (DR-08 — the
// row and its audit trail are never deleted). The already-cancelled state is
// checked and handled inside the same transaction as the update+audit write,
// not before it, so two concurrent cancels can't both pass the check and
// both write a "cancel" audit entry (NFR-PERF-06).
bookingsRouter.post("/api/bookings/:id/cancel", async (req, res, next) => {
  const parsed = parseBody(bookingCancelSchema, req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "validation_error", fields: parsed.errors });
    return;
  }

  const { employeeId } = parsed.data;

  try {
    const existing = await prisma.booking.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      res.status(404).json({ error: "booking_not_found" });
      return;
    }

    if (existing.employeeId !== employeeId) {
      res.status(403).json({ error: "not_owner", message: "ยกเลิกได้เฉพาะเจ้าของ Booking เท่านั้น" });
      return;
    }

    const booking = await prisma.$transaction(async (tx) => {
      const current = await tx.booking.findUniqueOrThrow({
        where: { id: existing.id },
        include: bookingInclude,
      });

      // Checked in this order, inside the same transaction as the write:
      // a booking that is both cancelled and past its endAt must report
      // already_cancelled, not booking_ended — cancellation is the more
      // specific, already-final state.
      if (current.status === "cancelled") {
        throw new AlreadyCancelledError(current);
      }

      if (current.endAt.getTime() < Date.now()) {
        throw new BookingEndedError();
      }

      const updated = await tx.booking.update({
        where: { id: existing.id },
        data: { status: "cancelled" },
        include: bookingInclude,
      });

      await tx.bookingAudit.create({
        data: { bookingId: updated.id, action: "cancel", actorEmployeeId: employeeId },
      });

      return updated;
    });

    res.status(200).json(booking);
  } catch (err) {
    if (err instanceof AlreadyCancelledError) {
      res.status(409).json({ error: "already_cancelled", booking: err.booking });
      return;
    }
    if (err instanceof BookingEndedError) {
      res.status(409).json({
        error: "booking_ended",
        message: "ไม่สามารถยกเลิก Booking ที่ผ่านไปแล้วได้",
      });
      return;
    }
    next(err);
  }
});
