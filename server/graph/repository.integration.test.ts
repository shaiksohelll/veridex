import { afterAll, describe, expect, it } from "vitest";
import { closeCognoDbDriver, getCognoDbDriver } from "../cognodb/driver";
import { loadEvaluationGraphFacts } from "./repository";

const hasCognoDbCredentials = Boolean(process.env.COGNODB_URI && process.env.COGNODB_PASSWORD);

describe("graph repository integration", () => {
  it.runIf(hasCognoDbCredentials)(
    "retrieves graph-derived facts for the approval-required seeded request",
    async () => {
      const facts = await loadEvaluationGraphFacts(
        getCognoDbDriver(),
        "request-approval-required",
      );

      expect(facts?.actionType.id).toBe("action-issue-refund");
      expect(facts?.authorizationPaths).not.toHaveLength(0);
      expect(facts?.resourceContexts).toHaveLength(1);
      expect(facts?.resourceContexts[0]?.customer?.id).toBe("customer-acme");
      expect(facts?.resourceContexts[0]?.tier?.id).toBe("tier-enterprise");
      const approvalPolicy = facts?.policies.find(
        policy => policy.policyId === "policy-approval-enterprise-refund",
      );
      expect(approvalPolicy).toMatchObject({
        effect: "REQUIRE_APPROVAL",
        policyId: "policy-approval-enterprise-refund",
        requiredRole: { id: "role-finance-manager" },
      });
      expect(facts?.eligibleApproversByRole["role-finance-manager"]).toContainEqual(
        expect.objectContaining({ id: "user-priya-manager" }),
      );
    },
    15_000,
  );

  afterAll(async () => {
    await closeCognoDbDriver();
  });
});
