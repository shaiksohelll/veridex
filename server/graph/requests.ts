import { customAlphabet } from "nanoid";
import type { Driver, Record as Neo4jRecord } from "neo4j-driver";
import type { ActionRequestFact } from "./repository";

export type CreateActionRequestInput = {
  actionTypeId: string;
  agentId: string;
  amount: number;
  resourceId: string;
};

export type EvaluationMetadata = {
  actionTypes: Array<{ actionTypeId: string; name: string }>;
  agents: Array<{ agentId: string; name: string }>;
  resources: Array<{
    customerId: string;
    customerName: string;
    resourceId: string;
    resourceName: string;
    tierName: string;
  }>;
};

function get<T>(record: Neo4jRecord, key: string): T {
  return record.get(key) as T;
}

function sessionFor(driver: Driver) {
  return driver.session();
}

const createGraphId = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 12);

export async function createActionRequest(
  driver: Driver,
  input: CreateActionRequestInput,
): Promise<ActionRequestFact | null> {
  const session = sessionFor(driver);
  const createdAt = new Date().toISOString();
  const actionRequestId = `request-${createGraphId()}`;

  try {
    const result = await session.executeWrite(async (transaction) => {
      const write = await transaction.run(
        "MATCH (agent:Agent {agentId: $agentId}) MATCH (actionType:ActionType {actionTypeId: $actionTypeId}) MATCH (resource:Resource {resourceId: $resourceId}) CREATE (request:ActionRequest {actionRequestId: $actionRequestId, amount: $amount, createdAt: $createdAt, status: 'EVALUATED'}) CREATE (agent)-[:REQUESTED]->(request) CREATE (request)-[:IS_TYPE]->(actionType) CREATE (request)-[:TOUCHES]->(resource) RETURN {actionRequestId: request.actionRequestId, amount: request.amount, createdAt: request.createdAt, status: request.status} AS actionRequest",
        { ...input, actionRequestId, createdAt },
      );
      return write.records[0] ? get<ActionRequestFact>(write.records[0], "actionRequest") : null;
    });
    return result;
  } finally {
    await session.close();
  }
}

export async function loadEvaluationMetadata(driver: Driver): Promise<EvaluationMetadata> {
  const session = sessionFor(driver);

  try {
    const agentsResult = await session.run(
      "MATCH (agent:Agent {active: true}) RETURN agent.agentId AS agentId, agent.name AS name ORDER BY agent.name ASC, agent.agentId ASC",
    );
    const actionTypesResult = await session.run(
      "MATCH (actionType:ActionType) RETURN actionType.actionTypeId AS actionTypeId, actionType.name AS name ORDER BY actionType.name ASC, actionType.actionTypeId ASC",
    );
    const resourcesResult = await session.run(
      "MATCH (resource:Resource {active: true})-[:BELONGS_TO]->(customer:Customer)-[:HAS_TIER]->(tier:Tier) RETURN resource.resourceId AS resourceId, resource.name AS resourceName, customer.customerId AS customerId, customer.name AS customerName, tier.name AS tierName ORDER BY customer.name ASC, resource.name ASC, resource.resourceId ASC",
    );

    return {
      actionTypes: actionTypesResult.records.map((record) => ({
        actionTypeId: get<string>(record, "actionTypeId"),
        name: get<string>(record, "name"),
      })),
      agents: agentsResult.records.map((record) => ({
        agentId: get<string>(record, "agentId"),
        name: get<string>(record, "name"),
      })),
      resources: resourcesResult.records.map((record) => ({
        customerId: get<string>(record, "customerId"),
        customerName: get<string>(record, "customerName"),
        resourceId: get<string>(record, "resourceId"),
        resourceName: get<string>(record, "resourceName"),
        tierName: get<string>(record, "tierName"),
      })),
    };
  } finally {
    await session.close();
  }
}
