import type { Driver, Record as Neo4jRecord } from "neo4j-driver";
export type GraphEntity = {
  id: string;
  label: string;
  name: string;
  active?: boolean;
};

export type AuthorizationPath = {
  actionType: GraphEntity;
  agent: GraphEntity;
  operator: GraphEntity;
  permission: GraphEntity;
  role: GraphEntity;
};

export type ResourceContext = {
  customer?: GraphEntity & { verified: boolean };
  resource: GraphEntity;
  tier?: GraphEntity;
};

export type PolicyFact = {
  effect: "ALLOW" | "BLOCK" | "REQUIRE_APPROVAL";
  maxAmount?: number;
  minAmount?: number;
  name: string;
  policyId: string;
  priority: number;
  reasonCode: string;
  reasonText: string;
  requiredRole?: GraphEntity;
  version: number;
};

export type EligibleApprover = GraphEntity;

export type ActionRequestFact = {
  actionRequestId: string;
  amount: number;
  createdAt: string;
  scenarioKey?: string;
  status: string;
};

export type EvaluationGraphFacts = {
  actionRequest: ActionRequestFact;
  actionType: GraphEntity;
  authorizationPaths: AuthorizationPath[];
  primaryAgent: GraphEntity;
  resourceContexts: ResourceContext[];
  policies: PolicyFact[];
  eligibleApproversByRole: Record<string, EligibleApprover[]>;
};

type ActionRequestContextRow = {
  actionRequest: ActionRequestFact;
  actionType: GraphEntity;
  agent: GraphEntity;
  resourceContexts: Array<{
    customerActive: boolean | null;
    customerId: string | null;
    customerName: string | null;
    customerVerified: boolean | null;
    resourceActive: boolean | null;
    resourceId: string | null;
    resourceName: string | null;
    tierId: string | null;
    tierName: string | null;
  }>;
};

function get<T>(record: Neo4jRecord, key: string): T {
  return record.get(key) as T;
}

function driverSession(driver: Driver) {
  return driver.session();
}

function graphEntity(
  id: string,
  label: string,
  name: string,
  active?: boolean,
): GraphEntity {
  return active === undefined ? { id, label, name } : { active, id, label, name };
}

export async function loadActionRequestContext(
  driver: Driver,
  actionRequestId: string,
): Promise<{
  actionRequest: ActionRequestFact;
  actionType: GraphEntity;
  primaryAgent: GraphEntity;
  resourceContexts: ResourceContext[];
} | null> {
  const session = driverSession(driver);

  try {
    const result = await session.run(
      "MATCH (agent:Agent)-[:REQUESTED]->(request:ActionRequest {actionRequestId: $actionRequestId})-[:IS_TYPE]->(actionType:ActionType) OPTIONAL MATCH (request)-[:TOUCHES]->(resource:Resource) OPTIONAL MATCH (resource)-[:BELONGS_TO]->(customer:Customer) OPTIONAL MATCH (customer)-[:HAS_TIER]->(tier:Tier) RETURN {actionRequestId: request.actionRequestId, amount: request.amount, createdAt: request.createdAt, scenarioKey: request.scenarioKey, status: request.status} AS actionRequest, {id: actionType.actionTypeId, label: 'ActionType', name: actionType.name} AS actionType, {active: agent.active, id: agent.agentId, label: 'Agent', name: agent.name} AS agent, collect(DISTINCT {customerActive: customer.active, customerId: customer.customerId, customerName: customer.name, customerVerified: customer.verified, resourceActive: resource.active, resourceId: resource.resourceId, resourceName: resource.name, tierId: tier.tierId, tierName: tier.name}) AS resourceContexts",
      { actionRequestId },
    );
    const record = result.records[0];
    if (!record) return null;

    const row = {
      actionRequest: get<ActionRequestFact>(record, "actionRequest"),
      actionType: get<GraphEntity>(record, "actionType"),
      agent: get<GraphEntity>(record, "agent"),
      resourceContexts: get<ActionRequestContextRow["resourceContexts"]>(record, "resourceContexts"),
    };

    const resourceContexts = row.resourceContexts
      .filter((context) => Boolean(context.resourceId && context.resourceName))
      .map((context): ResourceContext => ({
        customer:
          context.customerId && context.customerName && context.customerVerified !== null
            ? {
                active: context.customerActive ?? false,
                id: context.customerId,
                label: "Customer",
                name: context.customerName,
                verified: context.customerVerified,
              }
            : undefined,
        resource: graphEntity(
          context.resourceId!,
          "Resource",
          context.resourceName!,
          context.resourceActive ?? false,
        ),
        tier:
          context.tierId && context.tierName
            ? graphEntity(context.tierId, "Tier", context.tierName)
            : undefined,
      }));

    return {
      actionRequest: row.actionRequest,
      actionType: row.actionType,
      primaryAgent: row.agent,
      resourceContexts,
    };
  } finally {
    await session.close();
  }
}

export async function loadAuthorizationPaths(
  driver: Driver,
  agentId: string,
  actionTypeId: string,
): Promise<AuthorizationPath[]> {
  const session = driverSession(driver);

  try {
    const result = await session.run(
      "MATCH (agent:Agent {agentId: $agentId})-[:OPERATED_BY]->(operator:User)-[:HAS_ROLE]->(role:Role)-[:GRANTS]->(permission:Permission)-[:ALLOWS]->(actionType:ActionType {actionTypeId: $actionTypeId}) RETURN {active: agent.active, id: agent.agentId, label: 'Agent', name: agent.name} AS agent, {active: operator.active, id: operator.userId, label: 'User', name: operator.displayName} AS operator, {active: role.active, id: role.roleId, label: 'Role', name: role.name} AS role, {active: permission.active, id: permission.permissionId, label: 'Permission', name: permission.name} AS permission, {id: actionType.actionTypeId, label: 'ActionType', name: actionType.name} AS actionType ORDER BY role.roleId ASC, permission.permissionId ASC",
      { actionTypeId, agentId },
    );

    return result.records.map((record) => ({
      actionType: get<GraphEntity>(record, "actionType"),
      agent: get<GraphEntity>(record, "agent"),
      operator: get<GraphEntity>(record, "operator"),
      permission: get<GraphEntity>(record, "permission"),
      role: get<GraphEntity>(record, "role"),
    }));
  } finally {
    await session.close();
  }
}

export async function loadApplicablePolicies(
  driver: Driver,
  input: { actionTypeId: string; tierId: string },
): Promise<PolicyFact[]> {
  const session = driverSession(driver);

  try {
    const result = await session.run(
      "MATCH (policy:Policy {active: true})-[:GOVERNS]->(:ActionType {actionTypeId: $actionTypeId}) MATCH (policy)-[:TARGETS]->(:Tier {tierId: $tierId}) OPTIONAL MATCH (policy)-[:REQUIRES_ROLE]->(requiredRole:Role) RETURN policy.effect AS effect, policy.maxAmount AS maxAmount, policy.minAmount AS minAmount, policy.name AS name, policy.policyId AS policyId, policy.priority AS priority, policy.reasonCode AS reasonCode, policy.reasonText AS reasonText, policy.version AS version, CASE WHEN requiredRole IS NULL THEN null ELSE {active: requiredRole.active, id: requiredRole.roleId, label: 'Role', name: requiredRole.name} END AS requiredRole ORDER BY CASE policy.effect WHEN 'BLOCK' THEN 3 WHEN 'REQUIRE_APPROVAL' THEN 2 ELSE 1 END DESC, policy.priority ASC, policy.policyId ASC",
      input,
    );

    return result.records.map((record) => ({
      effect: get<PolicyFact["effect"]>(record, "effect"),
      maxAmount: get<number | null>(record, "maxAmount") ?? undefined,
      minAmount: get<number | null>(record, "minAmount") ?? undefined,
      name: get<string>(record, "name"),
      policyId: get<string>(record, "policyId"),
      priority: get<number>(record, "priority"),
      reasonCode: get<string>(record, "reasonCode"),
      reasonText: get<string>(record, "reasonText"),
      requiredRole: get<GraphEntity | null>(record, "requiredRole") ?? undefined,
      version: get<number>(record, "version"),
    }));
  } finally {
    await session.close();
  }
}

export async function loadEligibleApprovers(
  driver: Driver,
  requiredRoleIds: string[],
): Promise<Record<string, EligibleApprover[]>> {
  if (requiredRoleIds.length === 0) return {};

  const session = driverSession(driver);

  try {
    const result = await session.run(
      "UNWIND $requiredRoleIds AS requiredRoleId MATCH (role:Role {roleId: requiredRoleId}) OPTIONAL MATCH (user:User {active: true})-[:HAS_ROLE]->(role) RETURN role.roleId AS roleId, collect(DISTINCT CASE WHEN user IS NULL THEN null ELSE {id: user.userId, label: 'User', name: user.displayName, active: user.active} END) AS eligibleApprovers ORDER BY role.roleId ASC",
      { requiredRoleIds },
    );

    return Object.fromEntries(
      result.records.map((record) => {
        const roleId = get<string>(record, "roleId");
        const approvers = get<Array<EligibleApprover | null>>(record, "eligibleApprovers").filter(
          (approver): approver is EligibleApprover => approver !== null,
        );
        return [roleId, approvers];
      }),
    );
  } finally {
    await session.close();
  }
}

/**
 * Retrieves only normalized graph facts. The later deterministic evaluator is
 * the single authority that converts these facts into a verdict.
 */
export async function loadEvaluationGraphFacts(
  driver: Driver,
  actionRequestId: string,
): Promise<EvaluationGraphFacts | null> {
  const context = await loadActionRequestContext(driver, actionRequestId);
  if (!context) return null;

  const authorizationPaths = await loadAuthorizationPaths(
    driver,
    context.primaryAgent.id,
    context.actionType.id,
  );
  const [resourceContext] = context.resourceContexts;
  const policies =
    context.resourceContexts.length === 1 && resourceContext?.tier
      ? await loadApplicablePolicies(driver, {
          actionTypeId: context.actionType.id,
          tierId: resourceContext.tier.id,
        })
      : [];
  const requiredRoleIds = policies
    .filter((policy) => policy.effect === "REQUIRE_APPROVAL")
    .flatMap((policy) => (policy.requiredRole ? [policy.requiredRole.id] : []));
  const eligibleApproversByRole = await loadEligibleApprovers(driver, requiredRoleIds);

  return {
    ...context,
    authorizationPaths,
    eligibleApproversByRole,
    policies,
  };
}

export type ActionRequestSummary = {
  actionRequestId: string;
  actionTypeId: string;
  actionTypeName: string;
  agentId: string;
  agentName: string;
  amount: number;
  approvalStatus?: string;
  createdAt: string;
  customerId?: string;
  customerName?: string;
  latestReasonCode?: string;
  latestVerdict?: string;
  resourceId?: string;
  resourceName?: string;
  status: string;
};

type CursorPayload = { c: string; id: string };

export function encodeCursor(createdAt: string, actionRequestId: string): string {
  const payload: CursorPayload = { c: createdAt, id: actionRequestId };
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

export function decodeCursor(cursor: string): CursorPayload | null {
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (typeof parsed.c === "string" && typeof parsed.id === "string") {
      return { c: parsed.c, id: parsed.id };
    }
    return null;
  } catch {
    return null;
  }
}

export async function listActionRequests(
  driver: Driver,
  input: { cursor?: string; limit: number },
): Promise<{ items: ActionRequestSummary[]; nextCursor?: string }> {
  const session = driverSession(driver);
  if (input.cursor !== undefined) {
    const decoded = decodeCursor(input.cursor);
    if (!decoded) {
      throw new Error("INVALID_CURSOR");
    }
  }
  const decoded = input.cursor ? decodeCursor(input.cursor) : null;
  const fetchLimit = input.limit + 1;

  try {
    const result = await session.run(
      `MATCH (agent:Agent)-[:REQUESTED]->(request:ActionRequest)-[:IS_TYPE]->(actionType:ActionType)
       OPTIONAL MATCH (request)-[:TOUCHES]->(resource:Resource)-[:BELONGS_TO]->(customer:Customer)
       OPTIONAL MATCH (request)-[:HAS_APPROVAL]->(approval:Approval)
       CALL (request) {
         OPTIONAL MATCH (request)-[:GENERATES]->(ev:Evidence)
         RETURN ev ORDER BY ev.createdAt DESC, ev.evidenceId DESC LIMIT 1
       }
       WITH agent, request, actionType, resource, customer, approval, ev
       WHERE $cursorCreatedAt IS NULL
         OR request.createdAt < $cursorCreatedAt
         OR (request.createdAt = $cursorCreatedAt AND request.actionRequestId < $cursorId)
       RETURN request.actionRequestId AS actionRequestId,
              actionType.actionTypeId AS actionTypeId,
              actionType.name AS actionTypeName,
              agent.agentId AS agentId,
              agent.name AS agentName,
              request.amount AS amount,
              request.createdAt AS createdAt,
              request.status AS status,
              resource.resourceId AS resourceId,
              resource.name AS resourceName,
              customer.customerId AS customerId,
              customer.name AS customerName,
              ev.verdict AS latestVerdict,
              ev.reasonCode AS latestReasonCode,
              approval.status AS approvalStatus
       ORDER BY request.createdAt DESC, request.actionRequestId DESC
       LIMIT toInteger($fetchLimit)`,
      {
        cursorCreatedAt: decoded?.c ?? null,
        cursorId: decoded?.id ?? null,
        fetchLimit,
      },
    );

    const rows = result.records.map((record) => ({
      actionRequestId: get<string>(record, "actionRequestId"),
      actionTypeId: get<string>(record, "actionTypeId"),
      actionTypeName: get<string>(record, "actionTypeName"),
      agentId: get<string>(record, "agentId"),
      agentName: get<string>(record, "agentName"),
      amount: get<number>(record, "amount"),
      approvalStatus: get<string | null>(record, "approvalStatus") ?? undefined,
      createdAt: get<string>(record, "createdAt"),
      customerId: get<string | null>(record, "customerId") ?? undefined,
      customerName: get<string | null>(record, "customerName") ?? undefined,
      latestReasonCode: get<string | null>(record, "latestReasonCode") ?? undefined,
      latestVerdict: get<string | null>(record, "latestVerdict") ?? undefined,
      resourceId: get<string | null>(record, "resourceId") ?? undefined,
      resourceName: get<string | null>(record, "resourceName") ?? undefined,
      status: get<string>(record, "status"),
    }));

    const hasMore = rows.length > input.limit;
    const items = hasMore ? rows.slice(0, input.limit) : rows;
    const lastItem = items[items.length - 1];
    const nextCursor =
      hasMore && lastItem
        ? encodeCursor(lastItem.createdAt, lastItem.actionRequestId)
        : undefined;

    return { items, nextCursor };
  } finally {
    await session.close();
  }
}
