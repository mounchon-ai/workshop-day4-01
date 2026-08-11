import { Router } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../prisma.js";
import { roomInputSchema } from "../schemas/room.js";
import { roomSearchQuerySchema } from "../schemas/room-search.js";
import { parseBody } from "../validation.js";
import { dayOfWeekForDate, toBangkokInstant } from "../bangkok-time.js";

export const roomsRouter = Router();

class CapacityBelowPendingBookingsError extends Error {
  constructor(public conflictingAttendeeCount: number) {
    super("capacity_below_pending_bookings");
  }
}

class RoomHasPendingBookingsError extends Error {
  constructor(public count: number) {
    super("room_has_pending_bookings");
  }
}

// "Pending" (FR-ROOM-06/07): a confirmed booking whose endAt hasn't passed
// yet — cancelled and already-ended bookings never block a room edit/delete,
// matching the same predicate bookings.ts uses for "still active."
function pendingBookingWhere(roomId: string) {
  return { roomId, status: "confirmed" as const, endAt: { gt: new Date() } };
}

roomsRouter.get("/api/rooms", async (_req, res, next) => {
  try {
    const rooms = await prisma.room.findMany({ orderBy: { name: "asc" } });
    res.status(200).json(rooms);
  } catch (err) {
    next(err);
  }
});

// Registered before "/api/rooms/:id"-shaped routes so the literal path
// "available" is never captured as an :id param.
roomsRouter.get("/api/rooms/available", async (req, res, next) => {
  const parsed = parseBody(roomSearchQuerySchema, req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "validation_error", fields: parsed.errors });
    return;
  }

  const { date, startTime, endTime, attendeeCount, building, floor } = parsed.data;

  try {
    const businessHours = await prisma.businessHours.findUniqueOrThrow({
      where: { dayOfWeek: dayOfWeekForDate(date) },
    });

    if (!businessHours.isOpen || startTime < businessHours.openTime || endTime > businessHours.closeTime) {
      res.status(409).json({
        error: "outside_business_hours",
        message: businessHours.isOpen
          ? `ช่วงเวลาที่ระบุอยู่นอกเวลาทำการ วันนี้เปิดทำการ ${businessHours.openTime}-${businessHours.closeTime}`
          : "วันที่เลือกเป็นวันหยุดทำการ ไม่เปิดให้จองห้องประชุม",
        businessHours,
      });
      return;
    }

    const startAt = toBangkokInstant(date, startTime);
    const endAt = toBangkokInstant(date, endTime);

    const rooms = await prisma.room.findMany({
      where: {
        status: "active",
        capacity: { gte: attendeeCount },
        ...(building ? { building } : {}),
        ...(floor ? { floor } : {}),
        bookings: {
          none: {
            status: "confirmed",
            startAt: { lt: endAt },
            endAt: { gt: startAt },
          },
        },
      },
      orderBy: { name: "asc" },
    });

    res.status(200).json(rooms);
  } catch (err) {
    next(err);
  }
});

roomsRouter.post("/api/rooms", async (req, res, next) => {
  const parsed = parseBody(roomInputSchema, req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "validation_error", fields: parsed.errors });
    return;
  }

  try {
    const room = await prisma.room.create({ data: parsed.data });
    res.status(201).json(room);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      res.status(409).json({ error: "duplicate_room_name", message: "มีห้องประชุมชื่อนี้อยู่แล้ว" });
      return;
    }
    next(err);
  }
});

roomsRouter.put("/api/rooms/:id", async (req, res, next) => {
  const parsed = parseBody(roomInputSchema, req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "validation_error", fields: parsed.errors });
    return;
  }

  const { capacity } = parsed.data;

  try {
    // FR-ROOM-07 only cares about a *decrease* ("ป้องกันการลด Capacity ต่ำ
    // กว่าที่จองไว้") — checked against the room's own stored capacity, not
    // unconditionally, so a status-only toggle that resubmits the room's
    // unchanged capacity never gets blocked by a pending booking that
    // exceeds it for an unrelated reason (e.g. pre-existing bad data).
    // Read-then-write in one transaction, mirroring evaluateBookingRules in
    // bookings.ts (NFR-PERF-06): otherwise a concurrent booking creation
    // could read the pre-edit capacity and commit between this check and
    // the update below, leaving a pending booking over the new capacity.
    const room = await prisma.$transaction(async (tx) => {
      const existing = await tx.room.findUniqueOrThrow({ where: { id: req.params.id } });

      if (capacity < existing.capacity) {
        const conflict = await tx.booking.aggregate({
          where: { ...pendingBookingWhere(req.params.id), attendeeCount: { gt: capacity } },
          _count: true,
          _max: { attendeeCount: true },
        });
        if (conflict._count > 0) {
          throw new CapacityBelowPendingBookingsError(conflict._max.attendeeCount!);
        }
      }

      return tx.room.update({ where: { id: req.params.id }, data: parsed.data });
    });
    res.status(200).json(room);
  } catch (err) {
    if (err instanceof CapacityBelowPendingBookingsError) {
      res.status(409).json({
        error: "capacity_below_pending_bookings",
        conflictingAttendeeCount: err.conflictingAttendeeCount,
        message: `ไม่สามารถลด Capacity ต่ำกว่า ${err.conflictingAttendeeCount} ได้ เนื่องจากมี Booking ที่ยืนยันแล้วจองไว้ ${err.conflictingAttendeeCount} คน`,
      });
      return;
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2002") {
        res.status(409).json({ error: "duplicate_room_name", message: "มีห้องประชุมชื่อนี้อยู่แล้ว" });
        return;
      }
      if (err.code === "P2025") {
        res.status(404).json({ error: "room_not_found" });
        return;
      }
    }
    next(err);
  }
});

// First DELETE route in this backend — every other "removal" (bookings,
// employees) is a status change (DR-08/DR-09), never a hard delete. Room is
// the sole aggregate where an actual delete is sanctioned (FR-ROOM-06), and
// even then only once it has no pending bookings.
roomsRouter.delete("/api/rooms/:id", async (req, res, next) => {
  try {
    // Same transactional check-then-write as PUT above: otherwise a
    // booking created for this room in the gap between the count and the
    // delete would make room.delete fail via FK (P2003), surfacing as the
    // "has booking history" message even though the room never actually
    // had zero pending bookings at any single instant.
    await prisma.$transaction(async (tx) => {
      const pendingCount = await tx.booking.count({ where: pendingBookingWhere(req.params.id) });
      if (pendingCount > 0) {
        throw new RoomHasPendingBookingsError(pendingCount);
      }
      await tx.room.delete({ where: { id: req.params.id } });
    });
    res.status(204).send();
  } catch (err) {
    if (err instanceof RoomHasPendingBookingsError) {
      res.status(409).json({
        error: "room_has_pending_bookings",
        count: err.count,
        message: `ไม่สามารถลบห้องนี้ได้ เนื่องจากมี Booking ที่ยังไม่ผ่าน ${err.count} รายการ`,
      });
      return;
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2025") {
        res.status(404).json({ error: "room_not_found" });
        return;
      }
      // No pending bookings, but the room still has historical (cancelled
      // or already-ended) ones — the FK is RESTRICT (never CASCADE, since
      // that history must survive per DR-08), so the delete itself fails
      // here rather than at the pending-count check above.
      if (err.code === "P2003") {
        res.status(409).json({
          error: "room_has_booking_history",
          message: "ไม่สามารถลบห้องนี้ได้ เนื่องจากมีประวัติการจองผูกอยู่ กรุณาปิดการใช้งานห้องแทนการลบ",
        });
        return;
      }
    }
    next(err);
  }
});
