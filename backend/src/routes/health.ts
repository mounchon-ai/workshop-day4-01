import { Router } from "express";
import { prisma } from "../prisma.js";

export const healthRouter = Router();

healthRouter.get("/api/health", async (_req, res, next) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({ status: "ok" });
  } catch (err) {
    next(err);
  }
});
