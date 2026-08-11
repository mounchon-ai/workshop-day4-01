import { Router } from "express";
import type { Prisma } from "@prisma/client";
import { prisma } from "../prisma.js";
import { bookingInputSchema } from "../schemas/booking.js";
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

// IR-11/FR-BKG-10 (creation) and FR-BKG-13 (edit, same rule set): every
// failing rule in this tier — Business Hours, Capacity, Conflict — is
// collected and reported together, not just the first one encountered.
// Must run inside the caller's transaction (via `tx`), never the top-level
// `prisma` client — the Conflict check's safety under concurrent requests
// (NFR-PERF-06) depends on the read-then-write happening in one transaction.
async function evaluateBookingRules(
  tx: Prisma.TransactionClient,
  params: {
    roomId: string;
    roomCapacity: number;
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

  if (params.attendeeCount > params.roomCapacity) {
    reasons.push({
      rule: "capacity_exceeded",
      message: `จำนวนผู้เข้าร่วมเกิน Capacity ของห้องนี้ (สูงสุด ${params.roomCapacity} คน)`,
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
    const bookings = await prisma.booking.findMany({
      where: { employeeId: parsed.data.employeeId },
      orderBy: { startAt: "desc" },
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
    const { room } = found;

    const startAt = toBangkokInstant(date, startTime);
    const endAt = toBangkokInstant(date, endTime);

    const booking = await prisma.$transaction(async (tx) => {
      const reasons = await evaluateBookingRules(tx, {
        roomId,
        roomCapacity: room.capacity,
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
    const { room } = found;

    const startAt = toBangkokInstant(date, startTime);
    const endAt = toBangkokInstant(date, endTime);

    const booking = await prisma.$transaction(async (tx) => {
      const reasons = await evaluateBookingRules(tx, {
        roomId,
        roomCapacity: room.capacity,
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
