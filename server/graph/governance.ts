import { customAlphabet } from "nanoid";
import type { Driver, Record as Neo4jRecord } from "neo4j-driver";
import type { DecisionResult } from "../decision/evaluator";

export type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED";

export type ApprovalRecord = {
  actionRequestId: string;
  approvalId: string;
  createdAt: string;
  decidedAt?: string;
  decider?: { id: string; name: string };
  eligibleApprovers: Array<{ id: string; name: string }>;
  policy?: { policyId: string; version: number };
  requiredRole: { id: string; name: string };
  status: ApprovalStatus;
};

export type EvidenceRecord = {
  actionRequestId: string;
  actionTypeId?: string;
  agentId: string;
  amount?: number;
  approvalDecision?: "APPROVED" | "REJECTED";
  createdAt: string;
  customerId?: string;
  eventType: "APPROVAL_DECIDED" | "DECISION_EVALUATED";
  evidenceId: string;
  policy?: { policyId: string; version: number };
  reasonCode: string;
  reasons?: string[];
  resourceId?: string;
  verdict: string;
};

export class ApprovalConflictError extends Error {
  readonly code = "APPROVAL_ALREADY_DECIDED";
  constructor() {
    super("This approval has already been decided.");
    this.name = "ApprovalConflictError";
  }
}

export class ApprovalEligibilityError extends Error {
  readonly code = "APPROVER_NOT_ELIGIBLE";
  constructor() {
    super("The selected user is not eligible to decide this approval.");
    this.name = "ApprovalEligibilityError";
  }
}

function get<T>(record: Neo4jRecord, key: string): T {
  return record.get(key) as T;
}
function sessionFor(driver: Driver) {
  return driver.session();
}
const createGraphId = customAlphabet(
  "0123456789abcdefghijklmnopqrstuvwxyz",
  12
);

export async function recordDecisionEvidence(
  driver: Driver,
  input: { agentId: string; decision: DecisionResult }
): Promise<{ approval?: ApprovalRecord; evidence: EvidenceRecord }> {
  const { decision } = input;
  const requiresApproval = decision.verdict === "APPROVAL_REQUIRED";
  const approvalId = requiresApproval
    ? `approval-${createGraphId()}`
    : undefined;
  const evidenceId = `evidence-${createGraphId()}`;
  const createdAt = new Date().toISOString();
  const session = sessionFor(driver);

  try {
    return await session.executeWrite(async transaction => {
      const result = await transaction.run(
        "MATCH (request:ActionRequest {actionRequestId: $actionRequestId}) OPTIONAL MATCH (requiredRole:Role {roleId: $requiredRoleId}) WITH request, requiredRole CREATE (evidence:Evidence {actionRequestId: $actionRequestId, actionTypeId: $actionTypeId, agentId: $agentId, amount: $amount, createdAt: $createdAt, customerId: $customerId, eventType: 'DECISION_EVALUATED', evidenceId: $evidenceId, policyId: $policyId, policyVersion: $policyVersion, reasonCode: $reasonCode, reasons: $reasons, resourceId: $resourceId, verdict: $verdict}) CREATE (request)-[:GENERATES]->(evidence) FOREACH (_ IN CASE WHEN $requiresApproval AND requiredRole IS NOT NULL THEN [1] ELSE [] END | CREATE (approval:Approval {actionRequestId: $actionRequestId, approvalId: $approvalId, createdAt: $createdAt, policyId: $policyId, policyVersion: $policyVersion, requiredRoleId: $requiredRoleId, status: 'PENDING'}) CREATE (request)-[:HAS_APPROVAL]->(approval) CREATE (approval)-[:ASSIGNED_TO]->(requiredRole)) RETURN evidence.evidenceId AS evidenceId, evidence.eventType AS eventType, CASE WHEN $requiresApproval THEN $approvalId ELSE null END AS approvalId",
        {
          actionRequestId: decision.evidenceSnapshot.actionRequestId,
          actionTypeId: decision.evidenceSnapshot.actionTypeId,
          agentId: input.agentId,
          amount: decision.evidenceSnapshot.amount,
          approvalId,
          createdAt,
          customerId: decision.evidenceSnapshot.customerId ?? null,
          evidenceId,
          policyId: decision.selectedPolicy?.policyId ?? null,
          policyVersion: decision.selectedPolicy?.version ?? null,
          reasonCode: decision.reasonCode,
          reasons: decision.reasons,
          requiredRoleId: decision.requiredApprovalRole?.id ?? null,
          requiresApproval,
          resourceId: decision.evidenceSnapshot.resourceId ?? null,
          verdict: decision.verdict,
        }
      );
      const record = result.records[0];
      if (!record) throw new Error("Unable to persist decision evidence.");

      const evidence: EvidenceRecord = {
        actionRequestId: decision.evidenceSnapshot.actionRequestId,
        actionTypeId: decision.evidenceSnapshot.actionTypeId,
        agentId: input.agentId,
        amount: decision.evidenceSnapshot.amount,
        createdAt,
        customerId: decision.evidenceSnapshot.customerId,
        eventType: "DECISION_EVALUATED",
        evidenceId: get<string>(record, "evidenceId"),
        policy: decision.selectedPolicy
          ? {
              policyId: decision.selectedPolicy.policyId,
              version: decision.selectedPolicy.version,
            }
          : undefined,
        reasonCode: decision.reasonCode,
        reasons: decision.reasons,
        resourceId: decision.evidenceSnapshot.resourceId,
        verdict: decision.verdict,
      };

      if (!requiresApproval || !approvalId || !decision.requiredApprovalRole)
        return { evidence };
      return {
        approval: {
          actionRequestId: decision.evidenceSnapshot.actionRequestId,
          approvalId,
          createdAt,
          eligibleApprovers: decision.eligibleApprovers.map(approver => ({
            id: approver.id,
            name: approver.name,
          })),
          policy: decision.selectedPolicy
            ? {
                policyId: decision.selectedPolicy.policyId,
                version: decision.selectedPolicy.version,
              }
            : undefined,
          requiredRole: {
            id: decision.requiredApprovalRole.id,
            name: decision.requiredApprovalRole.name,
          },
          status: "PENDING",
        },
        evidence,
      };
    });
  } finally {
    await session.close();
  }
}

export async function loadApprovalRecords(
  driver: Driver,
  actionRequestId?: string
): Promise<ApprovalRecord[]> {
  const session = sessionFor(driver);
  try {
    const result = await session.run(
      "MATCH (request:ActionRequest)-[:HAS_APPROVAL]->(approval:Approval)-[:ASSIGNED_TO]->(role:Role) WHERE $actionRequestId IS NULL OR request.actionRequestId = $actionRequestId OPTIONAL MATCH (decider:User)-[:DECIDED]->(approval) OPTIONAL MATCH (eligible:User {active: true})-[:HAS_ROLE]->(role) RETURN request.actionRequestId AS actionRequestId, approval.approvalId AS approvalId, approval.createdAt AS createdAt, approval.decidedAt AS decidedAt, approval.status AS status, approval.policyId AS policyId, approval.policyVersion AS policyVersion, {id: role.roleId, name: role.name} AS requiredRole, head(collect(DISTINCT CASE WHEN decider IS NULL THEN null ELSE {id: decider.userId, name: decider.displayName} END)) AS decider, collect(DISTINCT CASE WHEN eligible IS NULL THEN null ELSE {id: eligible.userId, name: eligible.displayName} END) AS eligibleApprovers ORDER BY approval.createdAt DESC, approval.approvalId ASC",
      { actionRequestId: actionRequestId ?? null }
    );
    return result.records.map(record => ({
      actionRequestId: get<string>(record, "actionRequestId"),
      approvalId: get<string>(record, "approvalId"),
      createdAt: get<string>(record, "createdAt"),
      decidedAt: get<string | null>(record, "decidedAt") ?? undefined,
      decider:
        get<ApprovalRecord["decider"] | null>(record, "decider") ?? undefined,
      eligibleApprovers: get<Array<{ id: string; name: string } | null>>(
        record,
        "eligibleApprovers"
      ).filter((user): user is { id: string; name: string } => user !== null),
      policy: get<string | null>(record, "policyId")
        ? {
            policyId: get<string>(record, "policyId"),
            version: get<number>(record, "policyVersion"),
          }
        : undefined,
      requiredRole: get<ApprovalRecord["requiredRole"]>(record, "requiredRole"),
      status: get<ApprovalStatus>(record, "status"),
    }));
  } finally {
    await session.close();
  }
}

export async function decideApproval(
  driver: Driver,
  input: {
    approvalId: string;
    deciderUserId: string;
    outcome: "APPROVED" | "REJECTED";
  }
): Promise<{ approval: ApprovalRecord; evidence: EvidenceRecord }> {
  const session = sessionFor(driver);
  const decidedAt = new Date().toISOString();
  const evidenceId = `evidence-${createGraphId()}`;
  try {
    const record = await session.executeWrite(async transaction => {
      const result = await transaction.run(
        "MATCH (request:ActionRequest)-[:HAS_APPROVAL]->(approval:Approval {approvalId: $approvalId})-[:ASSIGNED_TO]->(role:Role) MATCH (decider:User {userId: $deciderUserId, active: true})-[:HAS_ROLE]->(role) WITH request, approval, role, decider WHERE approval.status = 'PENDING' SET approval.status = $outcome, approval.decidedAt = $decidedAt CREATE (decider)-[:DECIDED]->(approval) CREATE (evidence:Evidence {actionRequestId: request.actionRequestId, agentId: null, approvalDecision: $outcome, createdAt: $decidedAt, eventType: 'APPROVAL_DECIDED', evidenceId: $evidenceId, policyId: approval.policyId, policyVersion: approval.policyVersion, reasonCode: 'APPROVAL_' + $outcome, resourceId: null, verdict: CASE WHEN $outcome = 'APPROVED' THEN 'ALLOWED' ELSE 'BLOCKED' END}) CREATE (request)-[:GENERATES]->(evidence) RETURN request.actionRequestId AS actionRequestId, approval.status AS status, approval.createdAt AS createdAt, approval.decidedAt AS decidedAt, approval.policyId AS policyId, approval.policyVersion AS policyVersion, {id: role.roleId, name: role.name} AS requiredRole, {id: decider.userId, name: decider.displayName} AS decider, evidence.evidenceId AS evidenceId, evidence.verdict AS verdict, evidence.reasonCode AS reasonCode",
        { ...input, decidedAt, evidenceId }
      );
      return result.records[0] ?? null;
    });

    if (!record) {
      const current = (await loadApprovalRecords(driver)).find(
        approval => approval.approvalId === input.approvalId
      );
      if (current && current.status !== "PENDING")
        throw new ApprovalConflictError();
      throw new ApprovalEligibilityError();
    }
    const requiredRole = get<ApprovalRecord["requiredRole"]>(
      record,
      "requiredRole"
    );
    const decider = get<NonNullable<ApprovalRecord["decider"]>>(
      record,
      "decider"
    );
    const approval: ApprovalRecord = {
      actionRequestId: get<string>(record, "actionRequestId"),
      approvalId: input.approvalId,
      createdAt: get<string>(record, "createdAt"),
      decidedAt: get<string>(record, "decidedAt"),
      decider,
      eligibleApprovers: [decider],
      policy: {
        policyId: get<string>(record, "policyId"),
        version: get<number>(record, "policyVersion"),
      },
      requiredRole,
      status: get<ApprovalStatus>(record, "status"),
    };
    const evidence: EvidenceRecord = {
      actionRequestId: approval.actionRequestId,
      agentId: "",
      approvalDecision: input.outcome,
      createdAt: decidedAt,
      eventType: "APPROVAL_DECIDED",
      evidenceId: get<string>(record, "evidenceId"),
      policy: approval.policy,
      reasonCode: get<string>(record, "reasonCode"),
      verdict: get<string>(record, "verdict"),
    };
    return { approval, evidence };
  } finally {
    await session.close();
  }
}

export async function loadEvidence(
  driver: Driver,
  actionRequestId: string
): Promise<EvidenceRecord[]> {
  const session = sessionFor(driver);
  try {
    const result = await session.run(
      "MATCH (:ActionRequest {actionRequestId: $actionRequestId})-[:GENERATES]->(evidence:Evidence) RETURN evidence.actionRequestId AS actionRequestId, evidence.actionTypeId AS actionTypeId, evidence.agentId AS agentId, evidence.amount AS amount, evidence.approvalDecision AS approvalDecision, evidence.createdAt AS createdAt, evidence.customerId AS customerId, evidence.eventType AS eventType, evidence.evidenceId AS evidenceId, evidence.policyId AS policyId, evidence.policyVersion AS policyVersion, evidence.reasonCode AS reasonCode, evidence.reasons AS reasons, evidence.resourceId AS resourceId, evidence.verdict AS verdict ORDER BY evidence.createdAt ASC, evidence.evidenceId ASC",
      { actionRequestId }
    );
    return result.records.map(record => ({
      actionRequestId: get<string>(record, "actionRequestId"),
      actionTypeId: get<string | null>(record, "actionTypeId") ?? undefined,
      agentId: get<string | null>(record, "agentId") ?? "",
      amount: get<number | null>(record, "amount") ?? undefined,
      approvalDecision:
        get<EvidenceRecord["approvalDecision"] | null>(
          record,
          "approvalDecision"
        ) ?? undefined,
      createdAt: get<string>(record, "createdAt"),
      customerId: get<string | null>(record, "customerId") ?? undefined,
      eventType: get<EvidenceRecord["eventType"]>(record, "eventType"),
      evidenceId: get<string>(record, "evidenceId"),
      policy: get<string | null>(record, "policyId")
        ? {
            policyId: get<string>(record, "policyId"),
            version: get<number>(record, "policyVersion"),
          }
        : undefined,
      reasonCode: get<string>(record, "reasonCode"),
      reasons: get<string[] | null>(record, "reasons") ?? undefined,
      resourceId: get<string | null>(record, "resourceId") ?? undefined,
      verdict: get<string>(record, "verdict"),
    }));
  } finally {
    await session.close();
  }
}
