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

function encodeCursorPayload(payload: unknown) {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

const SAFE_VALIDATION_MESSAGE =
  "Invalid request. Check the supplied values and try again.";

function expectSafeValidationPayload(body: unknown, status: number) {
  expect(status).toBe(400);
  const serialised = JSON.stringify(body);
  expect(serialised).toContain(SAFE_VALIDATION_MESSAGE);
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

  it("sanitizes invalid listRequests input", async () => {
    const negativeLimit = await invalidQuery("veridex.listRequests", {
      limit: -1,
    });
    expectSafeValidationPayload(negativeLimit.body, negativeLimit.status);

    const zeroLimit = await invalidQuery("veridex.listRequests", {
      limit: 0,
    });
    expectSafeValidationPayload(zeroLimit.body, zeroLimit.status);

    const exceedsMax = await invalidQuery("veridex.listRequests", {
      limit: 999,
    });
    expectSafeValidationPayload(exceedsMax.body, exceedsMax.status);
  });

  it("rejects malformed opaque cursors with BAD_REQUEST", async () => {
    const garbageCursor = await invalidQuery("veridex.listRequests", {
      cursor: "not-valid-base64!@#$",
    });
    expectSafeValidationPayload(garbageCursor.body, garbageCursor.status);

    const emptyJsonCursor = await invalidQuery("veridex.listRequests", {
      cursor: Buffer.from("{}").toString("base64url"),
    });
    expectSafeValidationPayload(emptyJsonCursor.body, emptyJsonCursor.status);

    const truncatedCursor = await invalidQuery("veridex.listRequests", {
      cursor: Buffer.from('{"c":123}').toString("base64url"),
    });
    expectSafeValidationPayload(truncatedCursor.body, truncatedCursor.status);
  });

  it("rejects semantically invalid cursor payloads before any database access", async () => {
    const partialTimestamp = await invalidQuery("veridex.listRequests", {
      cursor: encodeCursorPayload({ c: "9999", id: "x" }),
    });
    expectSafeValidationPayload(partialTimestamp.body, partialTimestamp.status);

    const emptyRequestId = await invalidQuery("veridex.listRequests", {
      cursor: encodeCursorPayload({
        c: "2026-08-28T00:00:00.000Z",
        id: "",
      }),
    });
    expectSafeValidationPayload(emptyRequestId.body, emptyRequestId.status);

    const unparseableRequestId = await invalidQuery("veridex.listRequests", {
      cursor: encodeCursorPayload({
        c: "2026-08-28T00:00:00.000Z",
        id: "not a request id",
      }),
    });
    expectSafeValidationPayload(
      unparseableRequestId.body,
      unparseableRequestId.status
    );

    const impossibleCalendarDate = await invalidQuery("veridex.listRequests", {
      cursor: encodeCursorPayload({
        c: "2026-13-45T00:00:00.000Z",
        id: "request-abc123def456",
      }),
    });
    expectSafeValidationPayload(
      impossibleCalendarDate.body,
      impossibleCalendarDate.status
    );
  });

  /**
   * Each timestamp below is a valid ISO-8601 instant, so Date.parse accepts it,
   * but none matches a stored createdAt value byte for byte. The keyset filter
   * compares the cursor timestamp as a string, so accepting these would place
   * the boundary in the wrong position and silently drop requests from the
   * audit history rather than failing loudly.
   */
  it("rejects non-canonical cursor timestamps that would break keyset ordering", async () => {
    const utcOffset = await invalidQuery("veridex.listRequests", {
      cursor: encodeCursorPayload({
        c: "2026-08-28T05:30:00.000+05:30",
        id: "request-historical-approved-refund",
      }),
    });
    expectSafeValidationPayload(utcOffset.body, utcOffset.status);

    const twoFractionalDigits = await invalidQuery("veridex.listRequests", {
      cursor: encodeCursorPayload({
        c: "2026-08-28T00:00:00.00Z",
        id: "request-historical-approved-refund",
      }),
    });
    expectSafeValidationPayload(
      twoFractionalDigits.body,
      twoFractionalDigits.status
    );

    const noFractionalDigits = await invalidQuery("veridex.listRequests", {
      cursor: encodeCursorPayload({
        c: "2026-08-28T00:00:00Z",
        id: "request-historical-approved-refund",
      }),
    });
    expectSafeValidationPayload(
      noFractionalDigits.body,
      noFractionalDigits.status
    );
  });

  it("does not report a well-formed cursor as a validation error", async () => {
    const wellFormed = await invalidQuery("veridex.listRequests", {
      cursor: encodeCursorPayload({
        c: "2026-08-28T00:00:00.000Z",
        id: "request-historical-approved-refund",
      }),
    });
    expect(wellFormed.status).not.toBe(400);
    expect(JSON.stringify(wellFormed.body)).not.toContain(
      SAFE_VALIDATION_MESSAGE
    );
  });
});
