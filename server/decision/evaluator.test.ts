import { describe, expect, it } from "vitest";
import {
  createEvidenceExplanationSnapshot,
  evaluateDecision,
  isPolicyApplicableForAmount,
  sortApplicablePolicies,
} from "./evaluator";
import type { EvaluationGraphFacts, PolicyFact } from "../graph/repository";

const financeManager = { active: true, id: "role-finance-manager", label: "Role", name: "Finance Manager" };

function policy(overrides: Partial<PolicyFact> = {}): PolicyFact {
  return {
    effect: "ALLOW",
    maxAmount: 499,
    minAmount: 1,
    name: "Refund Allow",
    policyId: "policy-allow-refund",
    priority: 100,
    reasonCode: "POLICY_ALLOW",
    reasonText: "Refund is within the permitted limit.",
    version: 1,
    ...overrides,
  };
}

function graphFacts(overrides: Partial<EvaluationGraphFacts> = {}): EvaluationGraphFacts {
  const agent = { active: true, id: "agent-billing", label: "Agent", name: "Billing Assistant" };
  const actionType = { id: "action-refund", label: "ActionType", name: "Issue Refund" };
  const operator = { active: true, id: "user-maya", label: "User", name: "Maya Finance" };
  const role = { active: true, id: "role-billing", label: "Role", name: "Billing Operator" };
  const permission = { active: true, id: "permission-refund", label: "Permission", name: "Issue Refund Permission" };

  return {
    actionRequest: {
      actionRequestId: "request-1",
      amount: 240,
      createdAt: "2026-08-27T00:00:00.000Z",
      scenarioKey: "ALLOWED",
      status: "CREATED",
    },
    actionType,
    authorizationPaths: [{ actionType, agent, operator, permission, role }],
    eligibleApproversByRole: {},
    policies: [policy()],
    primaryAgent: agent,
    resourceContexts: [
      {
        customer: {
          active: true,
          id: "customer-acme",
          label: "Customer",
          name: "Acme Corporation",
          verified: true,
        },
        resource: { active: true, id: "resource-invoice", label: "Resource", name: "Invoice #1842" },
        tier: { id: "tier-enterprise", label: "Tier", name: "Enterprise" },
      },
    ],
    ...overrides,
  };
}

describe("evaluateDecision", () => {
  it("allows only an explicitly applicable ALLOW policy", () => {
    const result = evaluateDecision(graphFacts());

    expect(result).toMatchObject({
      reasonCode: "POLICY_ALLOW",
      selectedPolicy: { policyId: "policy-allow-refund", version: 1 },
      verdict: "ALLOWED",
    });
    expect(result.explanationPath).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ relationship: "OPERATED_BY" }),
        expect.objectContaining({ relationship: "BELONGS_TO" }),
        expect.objectContaining({ relationship: "GOVERNS" }),
      ]),
    );
  });

  it("serializes the selected graph path and policy context deterministically for evidence", () => {
    const decision = evaluateDecision(graphFacts());
    const capturedAt = "2026-08-27T00:10:00.000Z";

    const first = createEvidenceExplanationSnapshot(decision, capturedAt);
    const second = createEvidenceExplanationSnapshot(decision, capturedAt);

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      capturedAt,
      decision: {
        actionRequestId: "request-1",
        actionTypeId: "action-refund",
        amount: 240,
        reasonCode: "POLICY_ALLOW",
        verdict: "ALLOWED",
      },
      formatVersion: 1,
      policy: {
        conditions: { maxAmount: 499, minAmount: 1 },
        name: "Refund Allow",
        policyId: "policy-allow-refund",
        reasonText: "Refund is within the permitted limit.",
      },
    });
    expect(first.orderedNodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "agent-billing", label: "Agent" }),
        expect.objectContaining({ id: "customer-acme", label: "Customer" }),
        expect.objectContaining({ id: "policy-allow-refund", label: "Policy" }),
      ]),
    );
    expect(first.relationships).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ relationship: "OPERATED_BY" }),
        expect.objectContaining({ relationship: "BELONGS_TO" }),
        expect.objectContaining({ relationship: "GOVERNS" }),
      ]),
    );
  });

  it("blocks a selected BLOCK policy over a matching ALLOW policy", () => {
    const result = evaluateDecision(
      graphFacts({
        policies: [policy(), policy({ effect: "BLOCK", policyId: "policy-block", priority: 90 })],
      }),
    );

    expect(result).toMatchObject({
      reasonCode: "POLICY_BLOCK",
      selectedPolicy: { policyId: "policy-block" },
      verdict: "BLOCKED",
    });
  });

  it("requires approval when an active eligible user holds the required role", () => {
    const result = evaluateDecision(
      graphFacts({
        eligibleApproversByRole: {
          "role-finance-manager": [
            { active: true, id: "user-priya", label: "User", name: "Priya Manager" },
          ],
        },
        policies: [
          policy({
            effect: "REQUIRE_APPROVAL",
            maxAmount: 999,
            minAmount: 500,
            policyId: "policy-approval-refund",
            priority: 20,
            reasonCode: "POLICY_APPROVAL_REQUIRED",
            requiredRole: financeManager,
          }),
        ],
        actionRequest: {
          actionRequestId: "request-approval",
          amount: 750,
          createdAt: "2026-08-27T00:00:00.000Z",
          status: "CREATED",
        },
      }),
    );

    expect(result).toMatchObject({
      reasonCode: "POLICY_APPROVAL_REQUIRED",
      requiredApprovalRole: { id: "role-finance-manager" },
      verdict: "APPROVAL_REQUIRED",
    });
    expect(result.eligibleApprovers).toHaveLength(1);
  });

  it("defaults to deny when no policy applies", () => {
    const result = evaluateDecision(graphFacts({ policies: [] }));

    expect(result).toMatchObject({ reasonCode: "NO_APPLICABLE_POLICY", verdict: "BLOCKED" });
  });

  it("uses effect precedence, priority, then policy ID as a deterministic tie-break", () => {
    const ordered = sortApplicablePolicies([
      policy({ effect: "ALLOW", policyId: "z-allow", priority: 1 }),
      policy({ effect: "REQUIRE_APPROVAL", policyId: "z-approval", priority: 1, requiredRole: financeManager }),
      policy({ effect: "BLOCK", policyId: "z-block", priority: 100 }),
      policy({ effect: "BLOCK", policyId: "b-block", priority: 20 }),
      policy({ effect: "BLOCK", policyId: "a-block", priority: 20 }),
    ]);

    expect(ordered.map((item) => item.policyId)).toEqual([
      "a-block",
      "b-block",
      "z-block",
      "z-approval",
      "z-allow",
    ]);
  });

  it("honors inclusive amount bounds and default-denies an out-of-bound policy", () => {
    const boundedPolicy = policy({ maxAmount: 500, minAmount: 100 });
    expect(isPolicyApplicableForAmount(boundedPolicy, 100)).toBe(true);
    expect(isPolicyApplicableForAmount(boundedPolicy, 500)).toBe(true);
    expect(isPolicyApplicableForAmount(boundedPolicy, 99)).toBe(false);
    expect(isPolicyApplicableForAmount(boundedPolicy, 501)).toBe(false);

    const result = evaluateDecision(
      graphFacts({
        actionRequest: {
          actionRequestId: "request-out-of-bound",
          amount: 600,
          createdAt: "2026-08-27T00:00:00.000Z",
          status: "CREATED",
        },
        policies: [boundedPolicy],
      }),
    );
    expect(result).toMatchObject({ reasonCode: "NO_APPLICABLE_POLICY", verdict: "BLOCKED" });
  });

  it("blocks unauthorized or inactive agents before policy evaluation", () => {
    expect(evaluateDecision(graphFacts({ authorizationPaths: [] }))).toMatchObject({
      reasonCode: "UNAUTHORIZED_AGENT",
      verdict: "BLOCKED",
    });
    expect(
      evaluateDecision(graphFacts({ primaryAgent: { active: false, id: "agent-billing", label: "Agent", name: "Billing Assistant" } })),
    ).toMatchObject({ reasonCode: "AGENT_INACTIVE", verdict: "BLOCKED" });
  });

  it("blocks unverified customers and approval policies without eligible users", () => {
    const unverified = evaluateDecision(
      graphFacts({
        resourceContexts: [
          {
            customer: {
              active: true,
              id: "customer-unverified",
              label: "Customer",
              name: "Northstar Labs",
              verified: false,
            },
            resource: { active: true, id: "resource-invoice", label: "Resource", name: "Invoice #2271" },
            tier: { id: "tier-standard", label: "Tier", name: "Standard" },
          },
        ],
      }),
    );
    expect(unverified).toMatchObject({ reasonCode: "CUSTOMER_UNVERIFIED", verdict: "BLOCKED" });

    const missingApprover = evaluateDecision(
      graphFacts({
        actionRequest: {
          actionRequestId: "request-no-approver",
          amount: 750,
          createdAt: "2026-08-27T00:00:00.000Z",
          status: "CREATED",
        },
        policies: [
          policy({
            effect: "REQUIRE_APPROVAL",
            maxAmount: 999,
            minAmount: 500,
            requiredRole: financeManager,
          }),
        ],
      }),
    );
    expect(missingApprover).toMatchObject({ reasonCode: "NO_ELIGIBLE_APPROVER", verdict: "BLOCKED" });
  });

  it("fails safely when an approval policy has an inactive required role", () => {
    const result = evaluateDecision(
      graphFacts({
        actionRequest: {
          actionRequestId: "request-inactive-approval-role",
          amount: 750,
          createdAt: "2026-08-27T00:00:00.000Z",
          status: "CREATED",
        },
        policies: [
          policy({
            effect: "REQUIRE_APPROVAL",
            maxAmount: 999,
            minAmount: 500,
            requiredRole: { ...financeManager, active: false },
          }),
        ],
      }),
    );

    expect(result).toMatchObject({ reasonCode: "APPROVAL_ROLE_MISSING", verdict: "BLOCKED" });
  });

  it("blocks malformed amounts and an action request that touches multiple resources", () => {
    expect(
      evaluateDecision(
        graphFacts({
          actionRequest: {
            actionRequestId: "request-invalid-amount",
            amount: Number.NaN,
            createdAt: "2026-08-27T00:00:00.000Z",
            status: "CREATED",
          },
        }),
      ),
    ).toMatchObject({ reasonCode: "INVALID_INPUT", verdict: "BLOCKED" });

    const base = graphFacts();
    expect(
      evaluateDecision({
        ...base,
        resourceContexts: [...base.resourceContexts, base.resourceContexts[0]!],
      }),
    ).toMatchObject({ reasonCode: "RESOURCE_CONTEXT_INVALID", verdict: "BLOCKED" });

    expect(evaluateDecision(graphFacts({ resourceContexts: [] }))).toMatchObject({
      reasonCode: "RESOURCE_NOT_FOUND",
      verdict: "BLOCKED",
    });
  });
});

describe("keyset cursor encoding", () => {
  it("round-trips createdAt and actionRequestId without data loss", async () => {
    const { encodeCursor, decodeCursor } = await import("../graph/repository");
    const encoded = encodeCursor("2026-08-27T00:00:00.000Z", "request-abc");
    const decoded = decodeCursor(encoded);
    expect(decoded).toEqual({ c: "2026-08-27T00:00:00.000Z", id: "request-abc" });
  });

  it("rejects malformed or empty cursor strings gracefully", async () => {
    const { decodeCursor } = await import("../graph/repository");
    expect(decodeCursor("not-valid-base64!@#")).toBeNull();
    expect(decodeCursor("")).toBeNull();
    expect(decodeCursor(Buffer.from("{}").toString("base64url"))).toBeNull();
    expect(decodeCursor(Buffer.from("{\"c\":123}").toString("base64url"))).toBeNull();
  });

  it("produces distinct cursors when timestamps match but IDs differ", async () => {
    const { encodeCursor } = await import("../graph/repository");
    const ts = "2026-08-27T00:00:00.000Z";
    const cursorA = encodeCursor(ts, "request-aaa");
    const cursorB = encodeCursor(ts, "request-bbb");
    expect(cursorA).not.toBe(cursorB);
  });
});
