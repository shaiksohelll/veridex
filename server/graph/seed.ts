import type { Driver, ManagedTransaction } from "neo4j-driver";
import { parseCognoDbConfig } from "../cognodb/config";
import { NODE_LABELS, RELATIONSHIP_TYPES, type NodeLabel, type RelationshipType } from "./schema";

type SeedProperties = Record<string, boolean | number | string | string[] | null>;

type RelationshipSeed = {
  cypher: string;
  rows: ReadonlyArray<Record<string, string>>;
};

const SEEDED_AT = "2026-08-27T00:00:00.000Z";

export const REQUIRED_SCENARIOS = [
  { expectedVerdict: "ALLOWED", key: "ALLOWED" },
  { expectedVerdict: "BLOCKED", key: "BLOCKED_POLICY" },
  { expectedVerdict: "APPROVAL_REQUIRED", key: "APPROVAL_REQUIRED" },
  { expectedVerdict: "BLOCKED", key: "UNAUTHORIZED_AGENT" },
  { expectedVerdict: "BLOCKED", key: "UNVERIFIED_CUSTOMER" },
  { expectedVerdict: "BLOCKED", key: "MISSING_APPROVER" },
  { expectedVerdict: "BLOCKED", key: "NO_APPLICABLE_POLICY" },
] as const;

export type RequiredScenarioKey = (typeof REQUIRED_SCENARIOS)[number]["key"];
export type ExpectedScenarioVerdict = (typeof REQUIRED_SCENARIOS)[number]["expectedVerdict"];

const SEEDED_NODES: Record<NodeLabel, ReadonlyArray<SeedProperties>> = {
  Agent: [
    { active: true, agentId: "agent-billing-assistant", name: "Billing Assistant" },
    { active: true, agentId: "agent-customer-data-assistant", name: "Customer Data Assistant" },
    { active: true, agentId: "agent-support-assistant", name: "Support Assistant" },
  ],
  User: [
    { active: true, displayName: "Maya Finance", userId: "user-maya-finance" },
    { active: true, displayName: "Diego Operations", userId: "user-diego-operations" },
    { active: true, displayName: "Nia Support", userId: "user-nia-support" },
    { active: true, displayName: "Priya Manager", userId: "user-priya-manager" },
    { active: false, displayName: "Ana Risk", userId: "user-ana-risk" },
  ],
  Role: [
    { active: true, name: "Billing Operator", roleId: "role-billing-operator" },
    { active: true, name: "Data Operations", roleId: "role-data-operations" },
    { active: true, name: "Support Operator", roleId: "role-support-operator" },
    { active: true, name: "Finance Manager", roleId: "role-finance-manager" },
    { active: true, name: "Risk Reviewer", roleId: "role-risk-reviewer" },
  ],
  Permission: [
    { active: true, name: "Issue Refund Permission", permissionId: "permission-issue-refund" },
    { active: true, name: "Export Customer Data Permission", permissionId: "permission-export-customer-data" },
    { active: true, name: "View Invoice Permission", permissionId: "permission-view-invoice" },
    { active: true, name: "Update Billing Profile Permission", permissionId: "permission-update-billing-profile" },
  ],
  ActionType: [
    { actionTypeId: "action-issue-refund", description: "Issue a customer refund", name: "Issue Refund" },
    {
      actionTypeId: "action-export-customer-data",
      description: "Export customer account data",
      name: "Export Customer Data",
    },
    { actionTypeId: "action-view-invoice", description: "View an invoice", name: "View Invoice" },
    {
      actionTypeId: "action-update-billing-profile",
      description: "Update billing profile data",
      name: "Update Billing Profile",
    },
  ],
  ActionRequest: [
    {
      actionRequestId: "request-allowed",
      amount: 240,
      createdAt: SEEDED_AT,
      scenarioKey: "ALLOWED",
      status: "CREATED",
    },
    {
      actionRequestId: "request-blocked-policy",
      amount: 1250,
      createdAt: SEEDED_AT,
      scenarioKey: "BLOCKED_POLICY",
      status: "CREATED",
    },
    {
      actionRequestId: "request-approval-required",
      amount: 750,
      createdAt: SEEDED_AT,
      scenarioKey: "APPROVAL_REQUIRED",
      status: "CREATED",
    },
    {
      actionRequestId: "request-unauthorized-agent",
      amount: 240,
      createdAt: SEEDED_AT,
      scenarioKey: "UNAUTHORIZED_AGENT",
      status: "CREATED",
    },
    {
      actionRequestId: "request-unverified-customer",
      amount: 240,
      createdAt: SEEDED_AT,
      scenarioKey: "UNVERIFIED_CUSTOMER",
      status: "CREATED",
    },
    {
      actionRequestId: "request-missing-approver",
      amount: 1,
      createdAt: SEEDED_AT,
      scenarioKey: "MISSING_APPROVER",
      status: "CREATED",
    },
    {
      actionRequestId: "request-no-applicable-policy",
      amount: 1,
      createdAt: SEEDED_AT,
      scenarioKey: "NO_APPLICABLE_POLICY",
      status: "CREATED",
    },
    {
      actionRequestId: "request-historical-approved-refund",
      amount: 750,
      createdAt: SEEDED_AT,
      scenarioKey: "HISTORICAL_APPROVAL",
      status: "APPROVED",
    },
  ],
  Resource: [
    { active: true, name: "Invoice #1842", resourceId: "resource-invoice-1842" },
    { active: true, name: "Invoice #1843", resourceId: "resource-invoice-1843" },
    { active: true, name: "Invoice #1844", resourceId: "resource-invoice-1844" },
    { active: true, name: "Invoice #2271", resourceId: "resource-invoice-2271" },
    { active: true, name: "Acme customer export package", resourceId: "resource-acme-export-package" },
    { active: true, name: "Acme billing profile", resourceId: "resource-acme-billing-profile" },
  ],
  Customer: [
    { active: true, customerId: "customer-acme", name: "Acme Corporation", verified: true },
    { active: true, customerId: "customer-northstar", name: "Northstar Labs", verified: false },
  ],
  Tier: [
    { name: "Enterprise", rank: 1, tierId: "tier-enterprise" },
    { name: "Standard", rank: 2, tierId: "tier-standard" },
  ],
  Policy: [
    {
      active: true,
      effect: "ALLOW",
      maxAmount: 499,
      minAmount: 0,
      policyId: "policy-allow-enterprise-refund",
      priority: 100,
      reasonCode: "POLICY_ALLOW",
      reasonText: "Enterprise refunds below 500 are permitted.",
      version: 1,
    },
    {
      active: true,
      effect: "BLOCK",
      maxAmount: null,
      minAmount: 1000,
      policyId: "policy-block-large-enterprise-refund",
      priority: 10,
      reasonCode: "POLICY_BLOCK",
      reasonText: "Enterprise refunds of 1,000 or more are blocked.",
      version: 1,
    },
    {
      active: true,
      effect: "REQUIRE_APPROVAL",
      maxAmount: 999,
      minAmount: 500,
      policyId: "policy-approval-enterprise-refund",
      priority: 20,
      reasonCode: "POLICY_APPROVAL_REQUIRED",
      reasonText: "Enterprise refunds from 500 to 999 require finance approval.",
      version: 1,
    },
    {
      active: true,
      effect: "ALLOW",
      maxAmount: 499,
      minAmount: 0,
      policyId: "policy-allow-standard-refund",
      priority: 100,
      reasonCode: "POLICY_ALLOW",
      reasonText: "Standard refunds below 500 are permitted for verified customers.",
      version: 1,
    },
    {
      active: true,
      effect: "REQUIRE_APPROVAL",
      maxAmount: null,
      minAmount: 0,
      policyId: "policy-approval-enterprise-export",
      priority: 20,
      reasonCode: "POLICY_APPROVAL_REQUIRED",
      reasonText: "Enterprise customer data exports require risk review.",
      version: 1,
    },
  ],
  Approval: [
    {
      approvalId: "approval-historical-refund",
      createdAt: SEEDED_AT,
      decidedAt: "2026-08-27T00:05:00.000Z",
      decisionReason: "Historical finance approval retained for evidence demonstration.",
      status: "APPROVED",
    },
  ],
  Evidence: [
    {
      actionRequestId: "request-historical-approved-refund",
      actionTypeId: "action-issue-refund",
      agentId: "agent-billing-assistant",
      amount: 750,
      approvalDecision: "APPROVED",
      createdAt: "2026-08-27T00:05:00.000Z",
      customerId: "customer-acme",
      eventType: "APPROVAL_DECIDED",
      evidenceId: "evidence-historical-refund-approval",
      policyId: "policy-approval-enterprise-refund",
      policyVersion: 1,
      reasonCode: "APPROVAL_GRANTED",
      reasons: ["Historical finance approval retained for evidence demonstration."],
      resourceId: "resource-invoice-1844",
      verdict: "ALLOWED",
    },
  ],
};

const NODE_UPSERT_QUERIES: Record<NodeLabel, string> = {
  Agent: "UNWIND $nodes AS node MERGE (entity:Agent {agentId: node.agentId}) ON CREATE SET entity = node ON MATCH SET entity += node",
  User: "UNWIND $nodes AS node MERGE (entity:User {userId: node.userId}) ON CREATE SET entity = node ON MATCH SET entity += node",
  Role: "UNWIND $nodes AS node MERGE (entity:Role {roleId: node.roleId}) ON CREATE SET entity = node ON MATCH SET entity += node",
  Permission:
    "UNWIND $nodes AS node MERGE (entity:Permission {permissionId: node.permissionId}) ON CREATE SET entity = node ON MATCH SET entity += node",
  ActionType:
    "UNWIND $nodes AS node MERGE (entity:ActionType {actionTypeId: node.actionTypeId}) ON CREATE SET entity = node ON MATCH SET entity += node",
  ActionRequest:
    "UNWIND $nodes AS node MERGE (entity:ActionRequest {actionRequestId: node.actionRequestId}) ON CREATE SET entity = node ON MATCH SET entity += node",
  Resource:
    "UNWIND $nodes AS node MERGE (entity:Resource {resourceId: node.resourceId}) ON CREATE SET entity = node ON MATCH SET entity += node",
  Customer:
    "UNWIND $nodes AS node MERGE (entity:Customer {customerId: node.customerId}) ON CREATE SET entity = node ON MATCH SET entity += node",
  Tier: "UNWIND $nodes AS node MERGE (entity:Tier {tierId: node.tierId}) ON CREATE SET entity = node ON MATCH SET entity += node",
  Policy:
    "UNWIND $nodes AS node MERGE (entity:Policy {policyId: node.policyId}) ON CREATE SET entity = node ON MATCH SET entity += node",
  Approval:
    "UNWIND $nodes AS node MERGE (entity:Approval {approvalId: node.approvalId}) ON CREATE SET entity = node ON MATCH SET entity += node",
  Evidence:
    "UNWIND $nodes AS node MERGE (entity:Evidence {evidenceId: node.evidenceId}) ON CREATE SET entity = node",
};

const RELATIONSHIP_SEEDS: Record<RelationshipType, RelationshipSeed> = {
  OPERATED_BY: {
    cypher:
      "UNWIND $rows AS row MATCH (source:Agent {agentId: row.sourceId}) MATCH (target:User {userId: row.targetId}) MERGE (source)-[:OPERATED_BY]->(target)",
    rows: [
      { sourceId: "agent-billing-assistant", targetId: "user-maya-finance" },
      { sourceId: "agent-customer-data-assistant", targetId: "user-diego-operations" },
      { sourceId: "agent-support-assistant", targetId: "user-nia-support" },
    ],
  },
  HAS_ROLE: {
    cypher:
      "UNWIND $rows AS row MATCH (source:User {userId: row.sourceId}) MATCH (target:Role {roleId: row.targetId}) MERGE (source)-[:HAS_ROLE]->(target)",
    rows: [
      { sourceId: "user-maya-finance", targetId: "role-billing-operator" },
      { sourceId: "user-diego-operations", targetId: "role-data-operations" },
      { sourceId: "user-nia-support", targetId: "role-support-operator" },
      { sourceId: "user-priya-manager", targetId: "role-finance-manager" },
      { sourceId: "user-ana-risk", targetId: "role-risk-reviewer" },
    ],
  },
  GRANTS: {
    cypher:
      "UNWIND $rows AS row MATCH (source:Role {roleId: row.sourceId}) MATCH (target:Permission {permissionId: row.targetId}) MERGE (source)-[:GRANTS]->(target)",
    rows: [
      { sourceId: "role-billing-operator", targetId: "permission-issue-refund" },
      { sourceId: "role-billing-operator", targetId: "permission-update-billing-profile" },
      { sourceId: "role-data-operations", targetId: "permission-export-customer-data" },
      { sourceId: "role-support-operator", targetId: "permission-view-invoice" },
      { sourceId: "role-finance-manager", targetId: "permission-issue-refund" },
    ],
  },
  ALLOWS: {
    cypher:
      "UNWIND $rows AS row MATCH (source:Permission {permissionId: row.sourceId}) MATCH (target:ActionType {actionTypeId: row.targetId}) MERGE (source)-[:ALLOWS]->(target)",
    rows: [
      { sourceId: "permission-issue-refund", targetId: "action-issue-refund" },
      { sourceId: "permission-export-customer-data", targetId: "action-export-customer-data" },
      { sourceId: "permission-view-invoice", targetId: "action-view-invoice" },
      { sourceId: "permission-update-billing-profile", targetId: "action-update-billing-profile" },
    ],
  },
  REQUESTED: {
    cypher:
      "UNWIND $rows AS row MATCH (source:Agent {agentId: row.sourceId}) MATCH (target:ActionRequest {actionRequestId: row.targetId}) MERGE (source)-[:REQUESTED]->(target)",
    rows: [
      { sourceId: "agent-billing-assistant", targetId: "request-allowed" },
      { sourceId: "agent-billing-assistant", targetId: "request-blocked-policy" },
      { sourceId: "agent-billing-assistant", targetId: "request-approval-required" },
      { sourceId: "agent-support-assistant", targetId: "request-unauthorized-agent" },
      { sourceId: "agent-billing-assistant", targetId: "request-unverified-customer" },
      { sourceId: "agent-customer-data-assistant", targetId: "request-missing-approver" },
      { sourceId: "agent-billing-assistant", targetId: "request-no-applicable-policy" },
      { sourceId: "agent-billing-assistant", targetId: "request-historical-approved-refund" },
    ],
  },
  IS_TYPE: {
    cypher:
      "UNWIND $rows AS row MATCH (source:ActionRequest {actionRequestId: row.sourceId}) MATCH (target:ActionType {actionTypeId: row.targetId}) MERGE (source)-[:IS_TYPE]->(target)",
    rows: [
      { sourceId: "request-allowed", targetId: "action-issue-refund" },
      { sourceId: "request-blocked-policy", targetId: "action-issue-refund" },
      { sourceId: "request-approval-required", targetId: "action-issue-refund" },
      { sourceId: "request-unauthorized-agent", targetId: "action-issue-refund" },
      { sourceId: "request-unverified-customer", targetId: "action-issue-refund" },
      { sourceId: "request-missing-approver", targetId: "action-export-customer-data" },
      { sourceId: "request-no-applicable-policy", targetId: "action-update-billing-profile" },
      { sourceId: "request-historical-approved-refund", targetId: "action-issue-refund" },
    ],
  },
  TOUCHES: {
    cypher:
      "UNWIND $rows AS row MATCH (source:ActionRequest {actionRequestId: row.sourceId}) MATCH (target:Resource {resourceId: row.targetId}) MERGE (source)-[:TOUCHES]->(target)",
    rows: [
      { sourceId: "request-allowed", targetId: "resource-invoice-1842" },
      { sourceId: "request-blocked-policy", targetId: "resource-invoice-1843" },
      { sourceId: "request-approval-required", targetId: "resource-invoice-1844" },
      { sourceId: "request-unauthorized-agent", targetId: "resource-invoice-1842" },
      { sourceId: "request-unverified-customer", targetId: "resource-invoice-2271" },
      { sourceId: "request-missing-approver", targetId: "resource-acme-export-package" },
      { sourceId: "request-no-applicable-policy", targetId: "resource-acme-billing-profile" },
      { sourceId: "request-historical-approved-refund", targetId: "resource-invoice-1844" },
    ],
  },
  BELONGS_TO: {
    cypher:
      "UNWIND $rows AS row MATCH (source:Resource {resourceId: row.sourceId}) MATCH (target:Customer {customerId: row.targetId}) MERGE (source)-[:BELONGS_TO]->(target)",
    rows: [
      { sourceId: "resource-invoice-1842", targetId: "customer-acme" },
      { sourceId: "resource-invoice-1843", targetId: "customer-acme" },
      { sourceId: "resource-invoice-1844", targetId: "customer-acme" },
      { sourceId: "resource-invoice-2271", targetId: "customer-northstar" },
      { sourceId: "resource-acme-export-package", targetId: "customer-acme" },
      { sourceId: "resource-acme-billing-profile", targetId: "customer-acme" },
    ],
  },
  HAS_TIER: {
    cypher:
      "UNWIND $rows AS row MATCH (source:Customer {customerId: row.sourceId}) MATCH (target:Tier {tierId: row.targetId}) MERGE (source)-[:HAS_TIER]->(target)",
    rows: [
      { sourceId: "customer-acme", targetId: "tier-enterprise" },
      { sourceId: "customer-northstar", targetId: "tier-standard" },
    ],
  },
  GOVERNS: {
    cypher:
      "UNWIND $rows AS row MATCH (source:Policy {policyId: row.sourceId}) MATCH (target:ActionType {actionTypeId: row.targetId}) MERGE (source)-[:GOVERNS]->(target)",
    rows: [
      { sourceId: "policy-allow-enterprise-refund", targetId: "action-issue-refund" },
      { sourceId: "policy-block-large-enterprise-refund", targetId: "action-issue-refund" },
      { sourceId: "policy-approval-enterprise-refund", targetId: "action-issue-refund" },
      { sourceId: "policy-allow-standard-refund", targetId: "action-issue-refund" },
      { sourceId: "policy-approval-enterprise-export", targetId: "action-export-customer-data" },
    ],
  },
  TARGETS: {
    cypher:
      "UNWIND $rows AS row MATCH (source:Policy {policyId: row.sourceId}) MATCH (target:Tier {tierId: row.targetId}) MERGE (source)-[:TARGETS]->(target)",
    rows: [
      { sourceId: "policy-allow-enterprise-refund", targetId: "tier-enterprise" },
      { sourceId: "policy-block-large-enterprise-refund", targetId: "tier-enterprise" },
      { sourceId: "policy-approval-enterprise-refund", targetId: "tier-enterprise" },
      { sourceId: "policy-allow-standard-refund", targetId: "tier-standard" },
      { sourceId: "policy-approval-enterprise-export", targetId: "tier-enterprise" },
    ],
  },
  REQUIRES_ROLE: {
    cypher:
      "UNWIND $rows AS row MATCH (source:Policy {policyId: row.sourceId}) MATCH (target:Role {roleId: row.targetId}) MERGE (source)-[:REQUIRES_ROLE]->(target)",
    rows: [
      { sourceId: "policy-approval-enterprise-refund", targetId: "role-finance-manager" },
      { sourceId: "policy-approval-enterprise-export", targetId: "role-risk-reviewer" },
    ],
  },
  HAS_APPROVAL: {
    cypher:
      "UNWIND $rows AS row MATCH (source:ActionRequest {actionRequestId: row.sourceId}) MATCH (target:Approval {approvalId: row.targetId}) MERGE (source)-[:HAS_APPROVAL]->(target)",
    rows: [{ sourceId: "request-historical-approved-refund", targetId: "approval-historical-refund" }],
  },
  ASSIGNED_TO: {
    cypher:
      "UNWIND $rows AS row MATCH (source:Approval {approvalId: row.sourceId}) MATCH (target:Role {roleId: row.targetId}) MERGE (source)-[:ASSIGNED_TO]->(target)",
    rows: [{ sourceId: "approval-historical-refund", targetId: "role-finance-manager" }],
  },
  DECIDED: {
    cypher:
      "UNWIND $rows AS row MATCH (source:User {userId: row.sourceId}) MATCH (target:Approval {approvalId: row.targetId}) MERGE (source)-[:DECIDED]->(target)",
    rows: [{ sourceId: "user-priya-manager", targetId: "approval-historical-refund" }],
  },
  GENERATES: {
    cypher:
      "UNWIND $rows AS row MATCH (source:ActionRequest {actionRequestId: row.sourceId}) MATCH (target:Evidence {evidenceId: row.targetId}) MERGE (source)-[:GENERATES]->(target)",
    rows: [{ sourceId: "request-historical-approved-refund", targetId: "evidence-historical-refund-approval" }],
  },
};

async function runSeedTransaction(transaction: ManagedTransaction): Promise<void> {
  for (const label of NODE_LABELS) {
    await transaction.run(NODE_UPSERT_QUERIES[label], { nodes: SEEDED_NODES[label] });
  }

  for (const relationshipType of RELATIONSHIP_TYPES) {
    const relationship = RELATIONSHIP_SEEDS[relationshipType];
    await transaction.run(relationship.cypher, { rows: relationship.rows });
  }
}

export async function seedGraph(driver: Driver): Promise<void> {
  const config = parseCognoDbConfig();
  const session = driver.session(config.database ? { database: config.database } : undefined);

  try {
    await session.executeWrite(runSeedTransaction);
  } finally {
    await session.close();
  }
}
