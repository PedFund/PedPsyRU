import {createPlatformApp} from "../http/app.js";

// An explicit alternate loopback port leaves the existing training pilot alone.
async function main(): Promise<void> {
  const app = createPlatformApp();
  const close = (): void => { void app.close(); };
  process.once("SIGINT", close);
  process.once("SIGTERM", close);
  try { await app.listen({host: "127.0.0.1", port: 4174}); }
  catch { await app.close(); process.exitCode = 1; }
}
void main();
