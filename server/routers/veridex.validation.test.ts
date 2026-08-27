import { createExpressMiddleware } from "@trpc/server/adapters/express";
import express from "express";
import { createServer } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createContext } from "../_core/context";
import { appRouter } from "../routers";

let closeServer: (() => Promise<void>) | undefined;
let endpoint = "";

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use(
    "/api/trpc",
    createExpressMiddleware({ router: appRouter, createContext })
  );
  const server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Test server address unavailable.");
  endpoint = `http://127.0.0.1:${address.port}/api/trpc`;
  closeServer = () =>
    new Promise((resolve, reject) =>
      server.close(error => (error ? reject(error) : resolve()))
    );
});

afterAll(async () => {
  await closeServer?.();
});

async function invalidQuery(path: string, input: unknown) {
  const batch = encodeURIComponent(JSON.stringify({ 0: { json: input } }));
  const response = await fetch(`${endpoint}/${path}?batch=1&input=${batch}`);
  return { body: await response.json(), status: response.status };
}

async function invalidMutation(path: string, input: unknown) {
  const response = await fetch(`${endpoint}/${path}?batch=1`, {
    body: JSON.stringify({ 0: { json: input } }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  return { body: await response.json(), status: response.status };
}

function expectSafeValidationPayload(body: unknown, status: number) {
  expect(status).toBe(400);
  const serialised = JSON.stringify(body);
  expect(serialised).toContain(
    "Invalid request. Check the supplied values and try again."
  );
  expect(serialised).not.toMatch(/Zod|regex|pattern|stack|invalid_format/i);
}

describe("Veridex validation responses", () => {
  it("sanitizes invalid evaluation input", async () => {
    const response = await invalidMutation("veridex.evaluate", {
      agentId: "invalid agent",
      actionTypeId: "action-issue-refund",
      amount: -1,
      resourceId: "resource-invoice-1844",
    });
    expectSafeValidationPayload(response.body, response.status);
  });

  it("sanitizes invalid explanation and evidence identifiers", async () => {
    const explanation = await invalidQuery("veridex.explain", {
      actionRequestId: "bad identifier!",
    });
    const evidence = await invalidQuery("veridex.evidence", {
      actionRequestId: "bad identifier!",
    });
    expectSafeValidationPayload(explanation.body, explanation.status);
    expectSafeValidationPayload(evidence.body, evidence.status);
  });

  it("sanitizes invalid approval-decision input", async () => {
    const response = await invalidMutation("veridex.decideApproval", {
      approvalId: "invalid approval!",
      deciderUserId: "user-priya-manager",
      outcome: "MAYBE",
    });
    expectSafeValidationPayload(response.body, response.status);
  });
});
