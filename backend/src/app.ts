import express, { type ErrorRequestHandler } from "express";
import cors from "cors";
import { healthRouter } from "./routes/health.js";
import { roomsRouter } from "./routes/rooms.js";
import { employeesRouter } from "./routes/employees.js";

const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "internal_server_error" });
};

export function createApp() {
  const app = express();

  const frontendOrigin = process.env.FRONTEND_ORIGIN ?? "http://localhost:3000";
  app.use(cors({ origin: frontendOrigin }));
  app.use(express.json());

  app.use(healthRouter);
  app.use(roomsRouter);
  app.use(employeesRouter);

  app.use(errorHandler);

  return app;
}
