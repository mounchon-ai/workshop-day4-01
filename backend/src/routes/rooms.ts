import { Router } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../prisma.js";
import { roomInputSchema } from "../schemas/room.js";
import { parseBody } from "../validation.js";

export const roomsRouter = Router();

roomsRouter.get("/api/rooms", async (_req, res, next) => {
  try {
    const rooms = await prisma.room.findMany({ orderBy: { name: "asc" } });
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

  try {
    const room = await prisma.room.update({
      where: { id: req.params.id },
      data: parsed.data,
    });
    res.status(200).json(room);
  } catch (err) {
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
