import { createApp } from "./app.js";

const DEFAULT_PORT = 3001;
const parsedPort = process.env.PORT ? Number(process.env.PORT) : NaN;
const port = Number.isInteger(parsedPort) && parsedPort > 0 ? parsedPort : DEFAULT_PORT;
const app = createApp();

app.listen(port, () => {
  console.log(`Backend listening on port ${port}`);
});
