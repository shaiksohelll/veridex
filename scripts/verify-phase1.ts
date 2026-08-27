import "dotenv/config";
import type { Driver, Record as Neo4jRecord } from "neo4j-driver";
import { closeCognoDbDriver, getCognoDbDriver, verifyCognoDbConnectivity } from "../server/cognodb/driver";
import { applyGraphSchema, NODE_LABELS, RELATIONSHIP_TYPES, assertFrozenGraphDefinition } from "../server/graph/schema";
import { REQUIRED_SCENARIOS, seedGraph, type RequiredScenarioKey } from "../server/graph/seed";

type Verdict = "ALLOWED" | "BLOCKED" | "APPROVAL_REQUIRED";
type PolicyEffect = "ALLOW" | "BLOCK" | "REQUIRE_APPROVAL";

type ScenarioFacts = {
  actionTypeId: string;
  agentActive: boolean;
  authorizationPathExists: boolean;
  customerActive: boolean;
  customerVerified: boolean;
  eligibleApproverCount: number;
  policyEffect?: PolicyEffect;
  resourceActive: boolean;
  resourceCount: number;
  requiredRoleId?: string;
  tierCount: number;
};

const EFFECT_RANK: Record<PolicyEffect, number> = {
  ALLOW: 1,
  REQUIRE_APPROVAL: 2,
  BLOCK: 3,
};

function read<T>(record: Neo4jRecord, key: string): T {
  return record.get(key) as T;
}

function evaluateVerificationFacts(facts: ScenarioFacts): Verdict {
  if (!facts.agentActive || !facts.authorizationPathExists) return "BLOCKED";
  if (facts.resourceCount !== 1 || !facts.resourceActive || facts.tierCount !== 1) return "BLOCKED";
  if (!facts.customerActive || !facts.customerVerified) return "BLOCKED";
  if (!facts.policyEffect) return "BLOCKED";
  if (facts.policyEffect === "BLOCK") return "BLOCKED";
  if (facts.policyEffect === "REQUIRE_APPROVAL") {
    return facts.requiredRoleId && facts.eligibleApproverCount > 0 ? "APPROVAL_REQUIRED" : "BLOCKED";
  }
  return "ALLOWED";
}

async function verifySchemaCoverage(driver: Driver): Promise<void> {
  const config = (await import("../server/cognodb/config")).parseCognoDbConfig();
  const session = driver.session(config.database ? { database: config.database } : undefined);

  try {
    for (const label of NODE_LABELS) {
      const result = await session.run(`MATCH (node:${label}) RETURN count(node) > 0 AS present`);
      if (!read<boolean>(result.records[0]!, "present")) {
        throw new Error(`Missing seeded node label: ${label}`);
      }
    }

    for (const relationshipType of RELATIONSHIP_TYPES) {
      const result = await session.run(`MATCH ()-[relationship:${relationshipType}]->() RETURN count(relationship) > 0 AS present`);
      if (!read<boolean>(result.records[0]!, "present")) {
        throw new Error(`Missing seeded relationship type: ${relationshipType}`);
      }
    }
  } finally {
    await session.close();
  }
}

async function loadScenarioFacts(driver: Driver, scenarioKey: RequiredScenarioKey): Promise<ScenarioFacts> {
  const config = (await import("../server/cognodb/config")).parseCognoDbConfig();
  const session = driver.session(config.database ? { database: config.database } : undefined);

  try {
    const requestResult = await session.run(
      "MATCH (agent:Agent)-[:REQUESTED]->(request:ActionRequest {scenarioKey: $scenarioKey})-[:IS_TYPE]->(actionType:ActionType) RETURN agent.active AS agentActive, actionType.actionTypeId AS actionTypeId, request.amount AS amount",
      { scenarioKey },
    );
    const requestRecord = requestResult.records[0];
    if (!requestRecord) throw new Error(`Missing seeded scenario: ${scenarioKey}`);

    const actionTypeId = read<string>(requestRecord, "actionTypeId");
    const amount = read<number>(requestRecord, "amount");
    const agentActive = read<boolean>(requestRecord, "agentActive");

    const authorizationResult = await session.run(
      "MATCH (agent:Agent)-[:REQUESTED]->(:ActionRequest {scenarioKey: $scenarioKey})-[:IS_TYPE]->(actionType:ActionType) OPTIONAL MATCH (agent)-[:OPERATED_BY]->(operator:User {active: true})-[:HAS_ROLE]->(:Role {active: true})-[:GRANTS]->(permission:Permission {active: true})-[:ALLOWS]->(actionType) RETURN count(permission) > 0 AS authorizationPathExists",
      { scenarioKey },
    );

    const resourceResult = await session.run(
      "MATCH (:ActionRequest {scenarioKey: $scenarioKey})-[:TOUCHES]->(resource:Resource) RETURN count(resource) AS resourceCount, collect({active: resource.active, resourceId: resource.resourceId}) AS resources",
      { scenarioKey },
    );
    const resourceRecord = resourceResult.records[0];
    const resourceCount = resourceRecord ? read<number>(resourceRecord, "resourceCount") : 0;
    const resources = resourceRecord ? read<Array<{ active: boolean; resourceId: string }>>(resourceRecord, "resources") : [];
    const resource = resources[0];
    if (!resource || resourceCount !== 1) {
      return {
        actionTypeId,
        agentActive,
        authorizationPathExists: read<boolean>(authorizationResult.records[0]!, "authorizationPathExists"),
        customerActive: false,
        customerVerified: false,
        eligibleApproverCount: 0,
        resourceActive: false,
        resourceCount,
        tierCount: 0,
      };
    }

    const customerResult = await session.run(
      "MATCH (resource:Resource {resourceId: $resourceId})-[:BELONGS_TO]->(customer:Customer) OPTIONAL MATCH (customer)-[:HAS_TIER]->(tier:Tier) RETURN customer.active AS customerActive, customer.verified AS customerVerified, count(tier) AS tierCount, collect(tier.tierId) AS tierIds",
      { resourceId: resource.resourceId },
    );
    const customerRecord = customerResult.records[0];
    if (!customerRecord) {
      return {
        actionTypeId,
        agentActive,
        authorizationPathExists: read<boolean>(authorizationResult.records[0]!, "authorizationPathExists"),
        customerActive: false,
        customerVerified: false,
        eligibleApproverCount: 0,
        resourceActive: resource.active,
        resourceCount,
        tierCount: 0,
      };
    }

    const tierIds = read<Array<string>>(customerRecord, "tierIds").filter((tierId): tierId is string => Boolean(tierId));
    const tierId = tierIds[0];
    const policiesResult = tierId
      ? await session.run(
          "MATCH (policy:Policy {active: true})-[:GOVERNS]->(:ActionType {actionTypeId: $actionTypeId}) MATCH (policy)-[:TARGETS]->(:Tier {tierId: $tierId}) WHERE (policy.minAmount IS NULL OR $amount >= policy.minAmount) AND (policy.maxAmount IS NULL OR $amount <= policy.maxAmount) RETURN policy.effect AS effect, policy.policyId AS policyId, policy.priority AS priority ORDER BY CASE policy.effect WHEN 'BLOCK' THEN 3 WHEN 'REQUIRE_APPROVAL' THEN 2 ELSE 1 END DESC, policy.priority ASC, policy.policyId ASC",
          { actionTypeId, amount, tierId },
        )
      : { records: [] };
    const selectedPolicy = policiesResult.records[0];
    const policyEffect = selectedPolicy ? read<PolicyEffect>(selectedPolicy, "effect") : undefined;
    const selectedPolicyId = selectedPolicy ? read<string>(selectedPolicy, "policyId") : undefined;

    const approvalResult = selectedPolicyId
      ? await session.run(
          "MATCH (policy:Policy {policyId: $policyId}) OPTIONAL MATCH (policy)-[:REQUIRES_ROLE]->(role:Role) OPTIONAL MATCH (user:User {active: true})-[:HAS_ROLE]->(role) RETURN head(collect(DISTINCT role.roleId)) AS requiredRoleId, count(DISTINCT user) AS eligibleApproverCount",
          { policyId: selectedPolicyId },
        )
      : { records: [] };
    const approvalRecord = approvalResult.records[0];

    return {
      actionTypeId,
      agentActive,
      authorizationPathExists: read<boolean>(authorizationResult.records[0]!, "authorizationPathExists"),
      customerActive: read<boolean>(customerRecord, "customerActive"),
      customerVerified: read<boolean>(customerRecord, "customerVerified"),
      eligibleApproverCount: approvalRecord ? read<number>(approvalRecord, "eligibleApproverCount") : 0,
      policyEffect,
      requiredRoleId: approvalRecord ? read<string | null>(approvalRecord, "requiredRoleId") || undefined : undefined,
      resourceActive: resource.active,
      resourceCount,
      tierCount: read<number>(customerRecord, "tierCount"),
    };
  } finally {
    await session.close();
  }
}

async function main(): Promise<void> {
  assertFrozenGraphDefinition();
  const driver = getCognoDbDriver();
  await verifyCognoDbConnectivity(driver);
  await applyGraphSchema(driver);
  await seedGraph(driver);
  await seedGraph(driver);
  await verifySchemaCoverage(driver);

  for (const scenario of REQUIRED_SCENARIOS) {
    const facts = await loadScenarioFacts(driver, scenario.key);
    const verdict = evaluateVerificationFacts(facts);
    if (verdict !== scenario.expectedVerdict) {
      throw new Error(`${scenario.key} expected ${scenario.expectedVerdict} but received ${verdict}.`);
    }
    console.info(`${scenario.key}: ${verdict}`);
  }

  console.info("Phase 1 CognoDB verification succeeded.");
}

main()
  .catch(() => {
    console.error("Phase 1 verification failed. Verify the CognoDB configuration, schema, and seed data.");
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeCognoDbDriver();
  });

export { EFFECT_RANK, evaluateVerificationFacts };
