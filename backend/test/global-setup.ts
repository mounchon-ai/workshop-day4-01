import { execSync } from "node:child_process";
import { existsSync, unlinkSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const backendRoot = path.resolve(fileURLToPath(import.meta.url), "..", "..");
const testDbPath = path.join(backendRoot, "prisma", "test.db");
// SQLite writes -journal (rollback journal) and -wal/-shm (WAL mode) companion
// files alongside the main db file. A run interrupted mid-transaction can
// leave one of these behind even when test.db itself is gone, which can
// corrupt or block the next run's freshly-created test.db.
const testDbCompanionPaths = [
  testDbPath,
  `${testDbPath}-journal`,
  `${testDbPath}-wal`,
  `${testDbPath}-shm`,
];

function removeTestDbFiles() {
  for (const filePath of testDbCompanionPaths) {
    if (existsSync(filePath)) {
      unlinkSync(filePath);
    }
  }
}

export default function setup() {
  removeTestDbFiles();

  execSync("npx prisma migrate deploy", {
    cwd: backendRoot,
    env: { ...process.env, DATABASE_URL: "file:./test.db" },
    stdio: "inherit",
  });

  return removeTestDbFiles;
}
