import { Router } from "express";
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
    const [room, employee] = await Promise.all([
      prisma.room.findUnique({ where: { id: roomId } }),
      prisma.employee.findUnique({ where: { id: employeeId } }),
    ]);

    if (!room) {
      res.status(404).json({ error: "room_not_found" });
      return;
    }
    // A disabled room/employee still exists (FR-ROOM-05/FR-EMP-05 keep their
    // booking history intact), it just can't be a target for new bookings —
    // same as not found, from this endpoint's point of view.
    if (room.status !== "active") {
      res.status(404).json({ error: "room_disabled", message: "ห้องนี้ถูกปิดการใช้งานแล้ว" });
      return;
    }

    if (!employee) {
      res.status(404).json({ error: "employee_not_found" });
      return;
    }
    if (employee.status !== "active") {
      res.status(404).json({ error: "employee_disabled", message: "พนักงานคนนี้ถูกปิดการใช้งานแล้ว" });
      return;
    }

    const startAt = toBangkokInstant(date, startTime);
    const endAt = toBangkokInstant(date, endTime);

    const booking = await prisma.$transaction(async (tx) => {
      const businessHours = await tx.businessHours.findUniqueOrThrow({
        where: { dayOfWeek: dayOfWeekForDate(date) },
      });

      // IR-11/FR-BKG-10: every failing rule in this tier (Business Hours,
      // Capacity, Conflict) is collected and reported together, not just
      // the first one encountered.
      const reasons: RejectionReason[] = [];

      if (!businessHours.isOpen || startTime < businessHours.openTime || endTime > businessHours.closeTime) {
        reasons.push({
          rule: "outside_business_hours",
          message: businessHours.isOpen
            ? `ช่วงเวลาที่ระบุอยู่นอกเวลาทำการ วันนี้เปิดทำการ ${businessHours.openTime}-${businessHours.closeTime}`
            : "วันที่เลือกเป็นวันหยุดทำการ ไม่เปิดให้จองห้องประชุม",
        });
      }

      if (attendeeCount > room.capacity) {
        reasons.push({
          rule: "capacity_exceeded",
          message: `จำนวนผู้เข้าร่วมเกิน Capacity ของห้องนี้ (สูงสุด ${room.capacity} คน)`,
        });
      }

      const conflict = await tx.booking.findFirst({
        where: {
          roomId,
          status: "confirmed",
          startAt: { lt: endAt },
          endAt: { gt: startAt },
        },
      });
      if (conflict) {
        reasons.push({
          rule: "conflict",
          message: "ช่วงเวลานี้ถูกจองไปแล้ว กรุณาเลือกช่วงเวลาอื่น",
        });
      }

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
