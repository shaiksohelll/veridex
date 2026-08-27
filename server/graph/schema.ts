import type { Driver } from "neo4j-driver";
export const NODE_LABELS = [
  "Agent",
  "User",
  "Role",
  "Permission",
  "ActionType",
  "ActionRequest",
  "Resource",
  "Customer",
  "Tier",
  "Policy",
  "Approval",
  "Evidence",
] as const;

export const RELATIONSHIP_TYPES = [
  "OPERATED_BY",
  "HAS_ROLE",
  "GRANTS",
  "ALLOWS",
  "REQUESTED",
  "IS_TYPE",
  "TOUCHES",
  "BELONGS_TO",
  "HAS_TIER",
  "GOVERNS",
  "TARGETS",
  "REQUIRES_ROLE",
  "HAS_APPROVAL",
  "ASSIGNED_TO",
  "DECIDED",
  "GENERATES",
] as const;

export type NodeLabel = (typeof NODE_LABELS)[number];
export type RelationshipType = (typeof RELATIONSHIP_TYPES)[number];

/**
 * Schema identifiers and labels are static application constants; all runtime
 * data values are supplied as Cypher parameters by repositories and scripts.
 */
export const SCHEMA_STATEMENTS = [
  "CREATE CONSTRAINT agent_id_unique IF NOT EXISTS FOR (node:Agent) REQUIRE node.agentId IS UNIQUE",
  "CREATE CONSTRAINT user_id_unique IF NOT EXISTS FOR (node:User) REQUIRE node.userId IS UNIQUE",
  "CREATE CONSTRAINT role_id_unique IF NOT EXISTS FOR (node:Role) REQUIRE node.roleId IS UNIQUE",
  "CREATE CONSTRAINT permission_id_unique IF NOT EXISTS FOR (node:Permission) REQUIRE node.permissionId IS UNIQUE",
  "CREATE CONSTRAINT action_type_id_unique IF NOT EXISTS FOR (node:ActionType) REQUIRE node.actionTypeId IS UNIQUE",
  "CREATE CONSTRAINT action_request_id_unique IF NOT EXISTS FOR (node:ActionRequest) REQUIRE node.actionRequestId IS UNIQUE",
  "CREATE CONSTRAINT resource_id_unique IF NOT EXISTS FOR (node:Resource) REQUIRE node.resourceId IS UNIQUE",
  "CREATE CONSTRAINT customer_id_unique IF NOT EXISTS FOR (node:Customer) REQUIRE node.customerId IS UNIQUE",
  "CREATE CONSTRAINT tier_id_unique IF NOT EXISTS FOR (node:Tier) REQUIRE node.tierId IS UNIQUE",
  "CREATE CONSTRAINT policy_id_unique IF NOT EXISTS FOR (node:Policy) REQUIRE node.policyId IS UNIQUE",
  "CREATE CONSTRAINT approval_id_unique IF NOT EXISTS FOR (node:Approval) REQUIRE node.approvalId IS UNIQUE",
  "CREATE CONSTRAINT evidence_id_unique IF NOT EXISTS FOR (node:Evidence) REQUIRE node.evidenceId IS UNIQUE",
  "CREATE INDEX action_request_scenario_key IF NOT EXISTS FOR (node:ActionRequest) ON (node.scenarioKey)",
  "CREATE INDEX policy_effect IF NOT EXISTS FOR (node:Policy) ON (node.effect)",
  "CREATE INDEX approval_status IF NOT EXISTS FOR (node:Approval) ON (node.status)",
  "CREATE INDEX evidence_event_type IF NOT EXISTS FOR (node:Evidence) ON (node.eventType)",
] as const;

export function assertFrozenGraphDefinition(): void {
  if (NODE_LABELS.length !== 12 || new Set(NODE_LABELS).size !== NODE_LABELS.length) {
    throw new Error("Frozen graph schema requires exactly twelve unique node labels.");
  }

  if (RELATIONSHIP_TYPES.length !== 16 || new Set(RELATIONSHIP_TYPES).size !== RELATIONSHIP_TYPES.length) {
    throw new Error("Frozen graph schema requires exactly sixteen unique relationship types.");
  }
}

export async function applyGraphSchema(driver: Driver): Promise<void> {
  assertFrozenGraphDefinition();
  const session = driver.session();

  try {
    for (const statement of SCHEMA_STATEMENTS) {
      await session.run(statement);
    }
  } finally {
    await session.close();
  }
}
