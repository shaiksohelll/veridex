import type {
  AuthorizationPath,
  EligibleApprover,
  EvaluationGraphFacts,
  GraphEntity,
  PolicyFact,
  ResourceContext,
} from "../graph/repository";

export const VERDICTS = ["ALLOWED", "BLOCKED", "APPROVAL_REQUIRED"] as const;
export type Verdict = (typeof VERDICTS)[number];

export const REASON_CODES = [
  "AGENT_INACTIVE",
  "APPROVAL_ROLE_MISSING",
  "CUSTOMER_UNVERIFIED",
  "INVALID_INPUT",
  "NO_APPLICABLE_POLICY",
  "NO_ELIGIBLE_APPROVER",
  "POLICY_ALLOW",
  "POLICY_APPROVAL_REQUIRED",
  "POLICY_BLOCK",
  "RESOURCE_CONTEXT_INVALID",
  "RESOURCE_NOT_FOUND",
  "UNAUTHORIZED_AGENT",
] as const;
export type ReasonCode = (typeof REASON_CODES)[number];

export type ExplanationStep = {
  from: GraphEntity;
  relationship: string;
  to: GraphEntity;
};

export type EvidenceSnapshot = {
  actionRequestId: string;
  actionTypeId: string;
  amount: number;
  customerId?: string;
  policy?: { policyId: string; version: number };
  reasonCode: ReasonCode;
  resourceId?: string;
  verdict: Verdict;
};

export type DecisionResult = {
  eligibleApprovers: EligibleApprover[];
  evidenceSnapshot: EvidenceSnapshot;
  explanationPath: ExplanationStep[];
  matchedPolicies: PolicyFact[];
  reasonCode: ReasonCode;
  reasons: string[];
  requiredApprovalRole?: GraphEntity;
  selectedPolicy?: PolicyFact;
  verdict: Verdict;
};

const EFFECT_PRECEDENCE: Record<PolicyFact["effect"], number> = {
  ALLOW: 1,
  REQUIRE_APPROVAL: 2,
  BLOCK: 3,
};

function hasActiveAuthorizationPath(path: AuthorizationPath): boolean {
  return Boolean(path.agent.active && path.operator.active && path.role.active && path.permission.active);
}

export function isPolicyApplicableForAmount(policy: PolicyFact, amount: number): boolean {
  const meetsLowerBound = policy.minAmount === undefined || amount >= policy.minAmount;
  const meetsUpperBound = policy.maxAmount === undefined || amount <= policy.maxAmount;
  return meetsLowerBound && meetsUpperBound;
}

export function sortApplicablePolicies(policies: PolicyFact[]): PolicyFact[] {
  return [...policies].sort((left, right) => {
    const effectComparison = EFFECT_PRECEDENCE[right.effect] - EFFECT_PRECEDENCE[left.effect];
    if (effectComparison !== 0) return effectComparison;
    if (left.priority !== right.priority) return left.priority - right.priority;
    return left.policyId.localeCompare(right.policyId);
  });
}

function authorizationSteps(path: AuthorizationPath | undefined): ExplanationStep[] {
  if (!path) return [];

  return [
    { from: path.agent, relationship: "OPERATED_BY", to: path.operator },
    { from: path.operator, relationship: "HAS_ROLE", to: path.role },
    { from: path.role, relationship: "GRANTS", to: path.permission },
    { from: path.permission, relationship: "ALLOWS", to: path.actionType },
  ];
}

function contextSteps(context: ResourceContext | undefined): ExplanationStep[] {
  if (!context?.customer) return [];

  const steps: ExplanationStep[] = [
    { from: context.resource, relationship: "BELONGS_TO", to: context.customer },
  ];
  if (context.tier) {
    steps.push({ from: context.customer, relationship: "HAS_TIER", to: context.tier });
  }
  return steps;
}

function policySteps(
  policy: PolicyFact | undefined,
  actionType: GraphEntity,
  context: ResourceContext | undefined,
): ExplanationStep[] {
  if (!policy) return [];

  const policyEntity = graphPolicyEntity(policy);
  const steps: ExplanationStep[] = [{ from: policyEntity, relationship: "GOVERNS", to: actionType }];
  if (context?.tier) steps.push({ from: policyEntity, relationship: "TARGETS", to: context.tier });
  if (policy.requiredRole) {
    steps.push({ from: policyEntity, relationship: "REQUIRES_ROLE", to: policy.requiredRole });
  }
  return steps;
}

function graphPolicyEntity(policy: PolicyFact): GraphEntity {
  return { id: policy.policyId, label: "Policy", name: policy.policyId };
}

function buildResult(
  facts: EvaluationGraphFacts,
  input: {
    context?: ResourceContext;
    eligibleApprovers?: EligibleApprover[];
    matchedPolicies?: PolicyFact[];
    reasonCode: ReasonCode;
    reasons: string[];
    requiredApprovalRole?: GraphEntity;
    selectedPolicy?: PolicyFact;
    verdict: Verdict;
  },
): DecisionResult {
  const selectedAuthorizationPath = facts.authorizationPaths.find(hasActiveAuthorizationPath);
  const context = input.context ?? facts.resourceContexts[0];
  const explanationPath = [
    ...authorizationSteps(selectedAuthorizationPath),
    ...contextSteps(context),
    ...policySteps(input.selectedPolicy, facts.actionType, context),
  ];

  return {
    eligibleApprovers: input.eligibleApprovers ?? [],
    evidenceSnapshot: {
      actionRequestId: facts.actionRequest.actionRequestId,
      actionTypeId: facts.actionType.id,
      amount: facts.actionRequest.amount,
      customerId: context?.customer?.id,
      policy: input.selectedPolicy
        ? { policyId: input.selectedPolicy.policyId, version: input.selectedPolicy.version }
        : undefined,
      reasonCode: input.reasonCode,
      resourceId: context?.resource.id,
      verdict: input.verdict,
    },
    explanationPath,
    matchedPolicies: input.matchedPolicies ?? [],
    reasonCode: input.reasonCode,
    reasons: input.reasons,
    requiredApprovalRole: input.requiredApprovalRole,
    selectedPolicy: input.selectedPolicy,
    verdict: input.verdict,
  };
}

/**
 * Pure decision authority. It accepts graph-derived facts and applies the
 * frozen contract without driver access, UI state, or LLM involvement.
 */
export function evaluateDecision(facts: EvaluationGraphFacts): DecisionResult {
  const amount = facts.actionRequest.amount;
  if (!Number.isFinite(amount) || amount <= 0) {
    return buildResult(facts, {
      reasonCode: "INVALID_INPUT",
      reasons: ["The request amount must be a positive finite number."],
      verdict: "BLOCKED",
    });
  }

  if (!facts.primaryAgent.active) {
    return buildResult(facts, {
      reasonCode: "AGENT_INACTIVE",
      reasons: ["The requesting agent is inactive."],
      verdict: "BLOCKED",
    });
  }

  if (!facts.authorizationPaths.some(hasActiveAuthorizationPath)) {
    return buildResult(facts, {
      reasonCode: "UNAUTHORIZED_AGENT",
      reasons: ["No active agent-to-permission authorization path allows this action type."],
      verdict: "BLOCKED",
    });
  }

  if (facts.resourceContexts.length === 0) {
    return buildResult(facts, {
      reasonCode: "RESOURCE_NOT_FOUND",
      reasons: ["The requested resource was not found."],
      verdict: "BLOCKED",
    });
  }

  if (facts.resourceContexts.length !== 1) {
    return buildResult(facts, {
      reasonCode: "RESOURCE_CONTEXT_INVALID",
      reasons: ["An action request must touch exactly one resource."],
      verdict: "BLOCKED",
    });
  }

  const [context] = facts.resourceContexts;
  if (!context || !context.resource.active) {
    return buildResult(facts, {
      context,
      reasonCode: "RESOURCE_NOT_FOUND",
      reasons: ["The requested resource is unavailable."],
      verdict: "BLOCKED",
    });
  }

  if (!context.customer || !context.customer.active || !context.tier) {
    return buildResult(facts, {
      context,
      reasonCode: "RESOURCE_CONTEXT_INVALID",
      reasons: ["The resource is missing a valid customer and tier context."],
      verdict: "BLOCKED",
    });
  }

  if (!context.customer.verified) {
    return buildResult(facts, {
      context,
      reasonCode: "CUSTOMER_UNVERIFIED",
      reasons: ["The resource belongs to an unverified customer."],
      verdict: "BLOCKED",
    });
  }

  const matchedPolicies = sortApplicablePolicies(
    facts.policies.filter((policy) => isPolicyApplicableForAmount(policy, amount)),
  );
  const selectedPolicy = matchedPolicies[0];
  if (!selectedPolicy) {
    return buildResult(facts, {
      context,
      matchedPolicies,
      reasonCode: "NO_APPLICABLE_POLICY",
      reasons: ["No active policy applies to this action, customer tier, and amount."],
      verdict: "BLOCKED",
    });
  }

  if (selectedPolicy.effect === "BLOCK") {
    return buildResult(facts, {
      context,
      matchedPolicies,
      reasonCode: "POLICY_BLOCK",
      reasons: [selectedPolicy.reasonText],
      selectedPolicy,
      verdict: "BLOCKED",
    });
  }

  if (selectedPolicy.effect === "REQUIRE_APPROVAL") {
    if (!selectedPolicy.requiredRole || !selectedPolicy.requiredRole.active) {
      return buildResult(facts, {
        context,
        matchedPolicies,
        reasonCode: "APPROVAL_ROLE_MISSING",
        reasons: ["The approval policy has no resolvable required role."],
        selectedPolicy,
        verdict: "BLOCKED",
      });
    }

    const eligibleApprovers = facts.eligibleApproversByRole[selectedPolicy.requiredRole.id] ?? [];
    if (eligibleApprovers.length === 0) {
      return buildResult(facts, {
        context,
        eligibleApprovers,
        matchedPolicies,
        reasonCode: "NO_ELIGIBLE_APPROVER",
        reasons: ["No active user holds the role required to approve this action."],
        requiredApprovalRole: selectedPolicy.requiredRole,
        selectedPolicy,
        verdict: "BLOCKED",
      });
    }

    return buildResult(facts, {
      context,
      eligibleApprovers,
      matchedPolicies,
      reasonCode: "POLICY_APPROVAL_REQUIRED",
      reasons: [selectedPolicy.reasonText],
      requiredApprovalRole: selectedPolicy.requiredRole,
      selectedPolicy,
      verdict: "APPROVAL_REQUIRED",
    });
  }

  return buildResult(facts, {
    context,
    matchedPolicies,
    reasonCode: "POLICY_ALLOW",
    reasons: [selectedPolicy.reasonText],
    selectedPolicy,
    verdict: "ALLOWED",
  });
}
