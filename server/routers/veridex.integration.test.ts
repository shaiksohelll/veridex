import { afterAll, describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import { appRouter } from "../routers";
import { closeCognoDbDriver, getCognoDbDriver } from "../cognodb/driver";
import type { TrpcContext } from "../_core/context";

const hasCognoDbCredentials = Boolean(
  process.env.COGNODB_URI && process.env.COGNODB_PASSWORD
);

function context(): TrpcContext {
  return {
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("veridex tRPC integration", () => {
  it.runIf(hasCognoDbCredentials)(
    "lists graph-derived evaluation metadata and evaluates a valid create-and-evaluate request",
    async () => {
      const caller = appRouter.createCaller(context());
      const metadata = await caller.veridex.meta();

      expect(metadata.agents).toContainEqual(
        expect.objectContaining({ agentId: "agent-billing-assistant" })
      );
      expect(metadata.actionTypes).toContainEqual(
        expect.objectContaining({ actionTypeId: "action-issue-refund" })
      );
      expect(metadata.resources).toContainEqual(
        expect.objectContaining({ resourceId: "resource-invoice-1842" })
      );

      const result = await caller.veridex.evaluate({
        actionTypeId: "action-issue-refund",
        agentId: "agent-billing-assistant",
        amount: 240,
        resourceId: "resource-invoice-1842",
      });
      expect(result.decision).toMatchObject({
        reasonCode: "POLICY_ALLOW",
        verdict: "ALLOWED",
      });
      expect(result.facts.resourceContexts).toHaveLength(1);
    },
    15_000
  );

  it.runIf(hasCognoDbCredentials)(
    "rejects with NOT_FOUND and creates no orphaned request when the resource does not exist",
    async () => {
      const caller = appRouter.createCaller(context());
      await expect(
        caller.veridex.evaluate({
          actionTypeId: "action-issue-refund",
          agentId: "agent-billing-assistant",
          amount: 240,
          resourceId: "resource-does-not-exist",
        }),
      ).rejects.toMatchObject<Partial<TRPCError>>({ code: "NOT_FOUND" });
    },
    15_000
  );

  it.runIf(hasCognoDbCredentials)(
    "creates a pending approval and appends immutable decision evidence when it is resolved",
    async () => {
      const caller = appRouter.createCaller(context());
      const evaluated = await caller.veridex.evaluate({
        actionTypeId: "action-issue-refund",
        agentId: "agent-billing-assistant",
        amount: 750,
        resourceId: "resource-invoice-1844",
      });

      expect(evaluated.decision.verdict).toBe("APPROVAL_REQUIRED");
      expect(evaluated.governance.approval).toMatchObject({
        status: "PENDING",
      });
      const approvalId = evaluated.governance.approval!.approvalId;
      const beforeDecision = await caller.veridex.evidence({
        actionRequestId: evaluated.facts.actionRequest.actionRequestId,
      });
      expect(beforeDecision).toHaveLength(1);
      expect(beforeDecision[0]).toMatchObject({
        actionTypeId: "action-issue-refund",
        amount: 750,
        customerId: "customer-acme",
        eventType: "DECISION_EVALUATED",
        policy: { policyId: "policy-approval-enterprise-refund", version: 1 },
        reasonCode: "POLICY_APPROVAL_REQUIRED",
        resourceId: "resource-invoice-1844",
        verdict: "APPROVAL_REQUIRED",
      });
      expect(beforeDecision[0]?.reasons).toContain(
        "Enterprise refunds from 500 to 999 require finance approval."
      );
      const originalSnapshot = beforeDecision[0]?.explanationSnapshot;
      expect(originalSnapshot).toMatchObject({
        decision: {
          actionRequestId: evaluated.facts.actionRequest.actionRequestId,
          amount: 750,
          reasonCode: "POLICY_APPROVAL_REQUIRED",
          verdict: "APPROVAL_REQUIRED",
        },
        policy: {
          conditions: { maxAmount: 999, minAmount: 500 },
          name: "Enterprise Refund Approval",
          policyId: "policy-approval-enterprise-refund",
          version: 1,
        },
        requiredApprovalRole: { id: "role-finance-manager", name: "Finance Manager" },
      });
      expect(originalSnapshot?.relationships).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ relationship: "OPERATED_BY" }),
          expect.objectContaining({ relationship: "GOVERNS" }),
          expect.objectContaining({ relationship: "REQUIRES_ROLE" }),
        ]),
      );

      const session = getCognoDbDriver().session();
      try {
        await session.executeWrite(transaction =>
          transaction.run(
            "MATCH (policy:Policy {policyId: $policyId}) SET policy.name = $name, policy.reasonText = $reasonText",
            {
              name: "Changed policy presentation",
              policyId: "policy-approval-enterprise-refund",
              reasonText: "Changed policy rationale",
            },
          ),
        );
        await session.executeWrite(transaction =>
          transaction.run(
            "MATCH (policy:Policy {policyId: $policyId})-[targeting:TARGETS]->(:Tier {tierId: $tierId}) DELETE targeting",
            {
              policyId: "policy-approval-enterprise-refund",
              tierId: "tier-enterprise",
            },
          ),
        );
        const reloadedEvidence = await caller.veridex.evidence({
          actionRequestId: evaluated.facts.actionRequest.actionRequestId,
        });
        expect(reloadedEvidence[0]?.explanationSnapshot).toEqual(originalSnapshot);
      } finally {
        await session.executeWrite(transaction =>
          transaction.run(
            "MATCH (policy:Policy {policyId: $policyId}) SET policy.name = $name, policy.reasonText = $reasonText",
            {
              name: "Enterprise Refund Approval",
              policyId: "policy-approval-enterprise-refund",
              reasonText: "Enterprise refunds from 500 to 999 require finance approval.",
            },
          ),
        );
        await session.executeWrite(transaction =>
          transaction.run(
            "MATCH (policy:Policy {policyId: $policyId}) MATCH (tier:Tier {tierId: $tierId}) MERGE (policy)-[:TARGETS]->(tier)",
            {
              policyId: "policy-approval-enterprise-refund",
              tierId: "tier-enterprise",
            },
          ),
        );
        await session.close();
      }

      const resolved = await caller.veridex.decideApproval({
        approvalId,
        deciderUserId: "user-priya-manager",
        outcome: "APPROVED",
      });
      expect(resolved.approval).toMatchObject({ status: "APPROVED" });

      const afterDecision = await caller.veridex.evidence({
        actionRequestId: evaluated.facts.actionRequest.actionRequestId,
      });
      expect(afterDecision).toHaveLength(2);
      expect(afterDecision.map(evidence => evidence.eventType)).toEqual([
        "DECISION_EVALUATED",
        "APPROVAL_DECIDED",
      ]);
      await expect(
        caller.veridex.decideApproval({
          approvalId,
          deciderUserId: "user-priya-manager",
          outcome: "REJECTED",
        })
      ).rejects.toMatchObject({ code: "CONFLICT" });
    },
    45_000
  );

  it.runIf(hasCognoDbCredentials)(
    "allows only one concurrent terminal decision for a pending approval",
    async () => {
      const firstCaller = appRouter.createCaller(context());
      const secondCaller = appRouter.createCaller(context());
      const evaluated = await firstCaller.veridex.evaluate({
        actionTypeId: "action-issue-refund",
        agentId: "agent-billing-assistant",
        amount: 750,
        resourceId: "resource-invoice-1844",
      });
      const approvalId = evaluated.governance.approval!.approvalId;

      const attempts = await Promise.allSettled([
        firstCaller.veridex.decideApproval({
          approvalId,
          deciderUserId: "user-priya-manager",
          outcome: "APPROVED",
        }),
        secondCaller.veridex.decideApproval({
          approvalId,
          deciderUserId: "user-priya-manager",
          outcome: "REJECTED",
        }),
      ]);

      expect(
        attempts.filter(attempt => attempt.status === "fulfilled")
      ).toHaveLength(1);
      expect(
        attempts.filter(attempt => attempt.status === "rejected")
      ).toHaveLength(1);
      const evidence = await firstCaller.veridex.evidence({
        actionRequestId: evaluated.facts.actionRequest.actionRequestId,
      });
      expect(
        evidence.filter(event => event.eventType === "APPROVAL_DECIDED")
      ).toHaveLength(1);
    },
    45_000
  );

  it("rejects malformed evaluation input before database access", async () => {
    const caller = appRouter.createCaller(context());
    await expect(
      caller.veridex.evaluate({
        actionTypeId: "action-issue-refund",
        agentId: "agent-billing-assistant",
        amount: 0,
        resourceId: "resource-invoice-1842",
      })
    ).rejects.toMatchObject<Partial<TRPCError>>({ code: "BAD_REQUEST" });
  });

  it.runIf(hasCognoDbCredentials)(
    "creates no orphaned ActionRequest when the resource does not exist",
    async () => {
      const session = getCognoDbDriver().session();
      try {
        const before = await session.run(
          "MATCH (request:ActionRequest) RETURN count(request) AS total",
        );
        const countBefore = before.records[0]?.get("total") as number;

        const caller = appRouter.createCaller(context());
        await expect(
          caller.veridex.evaluate({
            actionTypeId: "action-issue-refund",
            agentId: "agent-billing-assistant",
            amount: 240,
            resourceId: "resource-does-not-exist",
          }),
        ).rejects.toThrow();

        const after = await session.run(
          "MATCH (request:ActionRequest) RETURN count(request) AS total",
        );
        const countAfter = after.records[0]?.get("total") as number;
        expect(countAfter).toBe(countBefore);
      } finally {
        await session.close();
      }
    },
    15_000,
  );

  it.runIf(hasCognoDbCredentials)(
    "lists seeded action requests with correct structure and ordering",
    async () => {
      const caller = appRouter.createCaller(context());
      const result = await caller.veridex.listRequests({ limit: 50 });

      expect(result.items.length).toBeGreaterThan(0);
      // Every item has required fields
      for (const item of result.items) {
        expect(item.actionRequestId).toBeTruthy();
        expect(item.actionTypeId).toBeTruthy();
        expect(item.agentId).toBeTruthy();
        expect(typeof item.amount).toBe("number");
        expect(item.createdAt).toBeTruthy();
      }
      // Verify newest-first ordering
      for (let i = 1; i < result.items.length; i++) {
        const current = result.items[i]!;
        const previous = result.items[i - 1]!;
        const cmp = previous.createdAt.localeCompare(current.createdAt);
        expect(cmp).toBeGreaterThanOrEqual(0);
      }
    },
    15_000,
  );

  it.runIf(hasCognoDbCredentials)(
    "shows the terminal approval status for historically resolved requests",
    async () => {
      const caller = appRouter.createCaller(context());
      const result = await caller.veridex.listRequests({ limit: 200 });
      const historical = result.items.find(
        (item) => item.actionRequestId === "request-historical-approved-refund",
      );
      expect(historical).toBeDefined();
      expect(historical?.approvalStatus).toBe("APPROVED");
      expect(historical?.latestVerdict).toBeTruthy();
    },
    15_000,
  );

  it.runIf(hasCognoDbCredentials)(
    "paginates without duplicates or gaps when timestamps match",
    async () => {
      const caller = appRouter.createCaller(context());
      // Fetch all in small pages to verify no duplicates
      const allIds = new Set<string>();
      let cursor: string | undefined;
      let pages = 0;
      do {
        const page = await caller.veridex.listRequests({ cursor, limit: 2 });
        for (const item of page.items) {
          expect(allIds.has(item.actionRequestId)).toBe(false);
          allIds.add(item.actionRequestId);
        }
        cursor = page.nextCursor;
        pages++;
        if (pages > 50) break; // safety
      } while (cursor);

      // All in one page should match total collected
      const full = await caller.veridex.listRequests({ limit: 200 });
      expect(allIds.size).toBe(full.items.length);
    },
    30_000,
  );

  afterAll(async () => {
    await closeCognoDbDriver();
  });
});

