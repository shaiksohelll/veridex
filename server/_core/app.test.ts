import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "./app";

let server: Server;
let baseUrl = "";
let readinessChecks = 0;

beforeAll(async () => {
  server = createServer(
    createApp({
      readinessCheck: async () => {
        readinessChecks += 1;
      },
    })
  );
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Test server address unavailable.");
  }
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close(error => (error ? reject(error) : resolve()))
  );
});

describe("deployment probes", () => {
  it("reports liveness without touching CognoDB", async () => {
    const response = await fetch(`${baseUrl}/healthz`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ok" });
    expect(readinessChecks).toBe(0);
  });

  it("reports readiness only after the database check succeeds", async () => {
    const response = await fetch(`${baseUrl}/readyz`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ready" });
    expect(readinessChecks).toBe(1);
  });

  it("rejects oversized public request bodies", async () => {
    const response = await fetch(`${baseUrl}/healthz`, {
      body: JSON.stringify({ payload: "x".repeat(101 * 1024) }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(413);
  });

  it("returns a safe readiness failure without exposing its cause", async () => {
    const unavailableServer = createServer(
      createApp({
        readinessCheck: async () => {
          throw new Error("database connection details");
        },
      })
    );
    await new Promise<void>(resolve =>
      unavailableServer.listen(0, "127.0.0.1", resolve)
    );
    const address = unavailableServer.address();
    if (!address || typeof address === "string") {
      throw new Error("Test server address unavailable.");
    }

    try {
      const response = await fetch(`http://127.0.0.1:${address.port}/readyz`);

      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toEqual({ status: "unavailable" });
    } finally {
      await new Promise<void>((resolve, reject) =>
        unavailableServer.close(error => (error ? reject(error) : resolve()))
      );
    }
  });
});
