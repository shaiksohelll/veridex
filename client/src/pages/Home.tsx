import { trpc } from "@/lib/trpc";
import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  ChevronRight,
  CircleDot,
  FileSearch,
  Loader2,
  LockKeyhole,
  RefreshCw,
  Route,
  ScanSearch,
  ShieldCheck,
  ShieldX,
  UsersRound,
} from "lucide-react";

type Decision = {
  decision: {
    eligibleApprovers: Array<{ id: string; name: string }>;
    explanationPath: Array<{
      from: { id: string; label: string; name: string };
      relationship: string;
      to: { id: string; label: string; name: string };
    }>;
    reasonCode: string;
    reasons: string[];
    requiredApprovalRole?: { id: string; name: string };
    selectedPolicy?: { policyId: string; version: number };
    verdict: "ALLOWED" | "BLOCKED" | "APPROVAL_REQUIRED";
  };
  facts: {
    actionRequest: { actionRequestId: string; amount: number };
    actionType: { name: string };
    primaryAgent: { name: string };
    resourceContexts: Array<{
      customer?: { name: string; verified: boolean };
      resource: { name: string };
      tier?: { name: string };
    }>;
  };
  governance?: {
    approval?: ApprovalRecord;
    evidence: EvidenceRecord;
  };
};

type ApprovalRecord = {
  actionRequestId: string;
  approvalId: string;
  eligibleApprovers: Array<{ id: string; name: string }>;
  requiredRole: { id: string; name: string };
  status: "PENDING" | "APPROVED" | "REJECTED";
  decider?: { id: string; name: string };
};

type EvidenceRecord = {
  evidenceId: string;
  eventType: "DECISION_EVALUATED" | "APPROVAL_DECIDED";
  reasonCode: string;
  verdict: string;
};

const verdictStyles = {
  ALLOWED: {
    icon: ShieldCheck,
    label: "Allowed",
    panel: "border-zinc-900 bg-zinc-950 text-zinc-50",
    mark: "bg-zinc-50 text-zinc-950",
  },
  APPROVAL_REQUIRED: {
    icon: LockKeyhole,
    label: "Approval required",
    panel: "border-zinc-900 bg-zinc-800 text-zinc-50",
    mark: "bg-zinc-50 text-zinc-950",
  },
  BLOCKED: {
    icon: ShieldX,
    label: "Blocked",
    panel: "border-zinc-300 bg-zinc-100 text-zinc-950",
    mark: "bg-zinc-950 text-zinc-50",
  },
};

function SectionHeading({
  eyebrow,
  title,
  detail,
}: {
  eyebrow: string;
  title: string;
  detail?: string;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
        {eyebrow}
      </p>
      <h2 className="text-xl font-semibold tracking-[-0.04em] text-zinc-950">
        {title}
      </h2>
      {detail ? (
        <p className="max-w-xl text-sm leading-6 text-zinc-500">{detail}</p>
      ) : null}
    </div>
  );
}

function RelationshipTimeline({ decision }: { decision: Decision }) {
  const { explanationPath } = decision.decision;
  if (explanationPath.length === 0)
    return (
      <div className="border border-dashed border-zinc-300 bg-zinc-50 px-5 py-8 text-sm text-zinc-500">
        No complete relationship path is available for this blocked request. The
        stable reason code above identifies the failed decision guard.
      </div>
    );
  return (
    <ol className="border-l border-zinc-200 pl-5">
      {explanationPath.map((step, index) => (
        <li
          className="relative pb-6 last:pb-0"
          key={`${step.from.id}-${step.relationship}-${step.to.id}-${index}`}
        >
          <span className="absolute -left-[25px] top-1 grid h-3 w-3 place-items-center border border-zinc-900 bg-white">
            <span className="h-1 w-1 bg-zinc-950" />
          </span>
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center">
            <div className="min-w-0 border border-zinc-200 bg-white px-3 py-2.5">
              <p className="truncate text-sm font-semibold text-zinc-900">
                {step.from.name}
              </p>
              <p className="mt-0.5 text-[10px] uppercase tracking-[0.16em] text-zinc-500">
                {step.from.label}
              </p>
            </div>
            <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
              <ArrowRight className="h-3.5 w-3.5" />
              <span>{step.relationship.replaceAll("_", " ")}</span>
            </div>
            <div className="min-w-0 border border-zinc-200 bg-zinc-50 px-3 py-2.5">
              <p className="truncate text-sm font-semibold text-zinc-900">
                {step.to.name}
              </p>
              <p className="mt-0.5 text-[10px] uppercase tracking-[0.16em] text-zinc-500">
                {step.to.label}
              </p>
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

function DecisionPanel({
  decision,
  onExplain,
  explanationLoading,
}: {
  decision: Decision | null;
  onExplain: () => void;
  explanationLoading: boolean;
}) {
  if (!decision)
    return (
      <div className="flex min-h-[360px] flex-col justify-between border border-zinc-200 bg-zinc-50 p-6 sm:p-8">
        <div className="grid h-12 w-12 place-items-center border border-zinc-300 bg-white">
          <ScanSearch className="h-5 w-5 text-zinc-800" />
        </div>
        <div className="space-y-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
            Decision output
          </p>
          <h2 className="max-w-sm text-3xl font-semibold tracking-[-0.055em] text-zinc-900">
            Evaluate an action to see its authorization result.
          </h2>
          <p className="max-w-md text-sm leading-6 text-zinc-500">
            Veridex derives context from the connected graph. Customer
            information is not accepted as a caller claim.
          </p>
        </div>
      </div>
    );
  const style = verdictStyles[decision.decision.verdict];
  const Icon = style.icon;
  const context = decision.facts.resourceContexts[0];
  return (
    <div className={`min-h-[360px] border p-6 sm:p-8 ${style.panel}`}>
      <div className="flex items-start justify-between gap-4">
        <div className={`grid h-11 w-11 place-items-center ${style.mark}`}>
          <Icon className="h-5 w-5" />
        </div>
        <p className="border border-current/20 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] opacity-75">
          {decision.decision.reasonCode.replaceAll("_", " ")}
        </p>
      </div>
      <div className="mt-10 space-y-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] opacity-65">
          Deterministic verdict
        </p>
        <h2 className="text-5xl font-semibold tracking-[-0.065em] sm:text-6xl">
          {style.label}
        </h2>
        <p className="max-w-xl text-base leading-7 opacity-80">
          {decision.decision.reasons[0]}
        </p>
      </div>
      <div className="mt-9 grid gap-3 border-t border-current/15 pt-5 sm:grid-cols-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] opacity-60">
            Affected context
          </p>
          <p className="mt-1 text-sm font-medium">
            {context?.resource.name ?? "Resource unavailable"}
            {context?.customer ? ` · ${context.customer.name}` : ""}
          </p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] opacity-60">
            Policy basis
          </p>
          <p className="mt-1 text-sm font-medium">
            {decision.decision.selectedPolicy
              ? `${decision.decision.selectedPolicy.policyId} · v${decision.decision.selectedPolicy.version}`
              : "No policy selected"}
          </p>
        </div>
      </div>
      <button
        className="mt-7 inline-flex items-center gap-2 border border-current/30 px-4 py-2.5 text-sm font-semibold transition duration-150 hover:bg-white/10 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
        disabled={explanationLoading}
        onClick={onExplain}
        type="button"
      >
        {explanationLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Route className="h-4 w-4" />
        )}{" "}
        Recheck explanation
      </button>
    </div>
  );
}

function GovernancePanel({
  approval,
  evidence,
  deciderUserId,
  error,
  hasRequest,
  isLoading,
  isPending,
  onDeciderChange,
  onResolve,
}: {
  approval: ApprovalRecord | null;
  evidence: EvidenceRecord[];
  deciderUserId: string;
  error?: string;
  hasRequest: boolean;
  isLoading: boolean;
  isPending: boolean;
  onDeciderChange: (value: string) => void;
  onResolve: (outcome: "APPROVED" | "REJECTED") => void;
}) {
  if (!hasRequest) {
    return (
      <aside className="border border-zinc-200 bg-white p-6">
        <div className="flex items-center gap-2 text-zinc-900">
          <UsersRound className="h-4 w-4" />
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em]">
            03 / Approval & evidence
          </p>
        </div>
        <div className="mt-6 border-l-2 border-zinc-300 bg-zinc-50 px-4 py-4 text-sm leading-6 text-zinc-600">
          <FileSearch className="mb-3 h-4 w-4 text-zinc-900" />
          No request is selected. Evaluate an action to retrieve its approval
          requirement and immutable evidence.
        </div>
      </aside>
    );
  }
  return (
    <aside className="border border-zinc-200 bg-white p-6">
      <div className="flex items-center gap-2 text-zinc-900">
        <UsersRound className="h-4 w-4" />
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em]">
          03 / Approval & evidence
        </p>
      </div>
      {isLoading ? (
        <p className="mt-4 flex items-center gap-2 text-xs text-zinc-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Refreshing persisted governance records…
        </p>
      ) : null}
      {error ? (
        <p
          className="mt-4 border-l-2 border-zinc-950 bg-zinc-100 px-3 py-2 text-sm text-zinc-800"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      {approval ? (
        <div className="mt-6 space-y-5">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
              Required role
            </p>
            <p className="mt-1 text-2xl font-semibold tracking-[-0.045em]">
              {approval.requiredRole.name}
            </p>
            <p className="mt-2 text-sm leading-6 text-zinc-500">
              First terminal decision wins. Evidence is appended, never edited.
            </p>
          </div>
          <div className="border-y border-zinc-200 py-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
              Approval state
            </p>
            <p className="mt-1 text-sm font-semibold">{approval.status}</p>
            {approval.decider ? (
              <p className="mt-1 text-xs text-zinc-500">
                Decided by {approval.decider.name}
              </p>
            ) : null}
          </div>
          {approval.status === "PENDING" ? (
            <>
              <label className="block">
                <span className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                  Eligible demo approver
                </span>
                <select
                  className="h-11 w-full border border-zinc-300 bg-white px-3 text-sm font-medium outline-none focus:border-zinc-900"
                  onChange={event => onDeciderChange(event.target.value)}
                  value={deciderUserId}
                >
                  {approval.eligibleApprovers.map(approver => (
                    <option key={approver.id} value={approver.id}>
                      {approver.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  className="bg-zinc-950 px-3 py-3 text-sm font-semibold text-white transition hover:bg-zinc-800 active:scale-[0.97] disabled:cursor-not-allowed disabled:bg-zinc-400"
                  disabled={isPending || !deciderUserId}
                  onClick={() => onResolve("APPROVED")}
                  type="button"
                >
                  {isPending ? (
                    <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                  ) : (
                    "Approve"
                  )}
                </button>
                <button
                  className="border border-zinc-900 px-3 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-zinc-100 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={isPending || !deciderUserId}
                  onClick={() => onResolve("REJECTED")}
                  type="button"
                >
                  Reject
                </button>
              </div>
            </>
          ) : null}
          <div className="space-y-2 border-t border-zinc-200 pt-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
              Evidence trail
            </p>
            {evidence.map(event => (
              <div
                className="flex items-start justify-between gap-3 text-xs"
                key={event.evidenceId}
              >
                <div>
                  <p className="font-semibold text-zinc-900">
                    {event.eventType.replaceAll("_", " ")}
                  </p>
                  <p className="mt-0.5 text-zinc-500">
                    {event.reasonCode.replaceAll("_", " ")}
                  </p>
                </div>
                <span className="border border-zinc-200 px-1.5 py-0.5 font-semibold text-zinc-600">
                  {event.verdict}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="mt-6 border-l-2 border-zinc-900 bg-zinc-50 px-4 py-4 text-sm leading-6 text-zinc-600">
            <FileSearch className="mb-3 h-4 w-4 text-zinc-900" />
            No approval is required for this decision. The immutable decision
            evidence is listed below.
          </div>
          <div className="mt-5 space-y-2 border-t border-zinc-200 pt-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
              Evidence trail
            </p>
            {evidence.length > 0 ? (
              evidence.map(event => (
                <div
                  className="flex items-start justify-between gap-3 text-xs"
                  key={event.evidenceId}
                >
                  <div>
                    <p className="font-semibold text-zinc-900">
                      {event.eventType.replaceAll("_", " ")}
                    </p>
                    <p className="mt-0.5 text-zinc-500">
                      {event.reasonCode.replaceAll("_", " ")}
                    </p>
                  </div>
                  <span className="border border-zinc-200 px-1.5 py-0.5 font-semibold text-zinc-600">
                    {event.verdict}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-xs leading-5 text-zinc-500">
                No persisted evidence exists for the selected request.
              </p>
            )}
          </div>
        </>
      )}
    </aside>
  );
}

export default function Home() {
  const metadataQuery = trpc.veridex.meta.useQuery(undefined, {
    enabled: false,
    networkMode: "always",
    retry: 2,
    retryDelay: 1_000,
  });
  const evaluateMutation = trpc.veridex.evaluate.useMutation();
  const approvalMutation = trpc.veridex.decideApproval.useMutation();
  const [agentId, setAgentId] = useState("");
  const [actionTypeId, setActionTypeId] = useState("");
  const [resourceId, setResourceId] = useState("");
  const [amount, setAmount] = useState("240");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [explanationRequestId, setExplanationRequestId] = useState<
    string | null
  >(null);
  const [approval, setApproval] = useState<ApprovalRecord | null>(null);
  const [evidence, setEvidence] = useState<EvidenceRecord[]>([]);
  const [deciderUserId, setDeciderUserId] = useState("");
  const explainQuery = trpc.veridex.explain.useQuery(
    { actionRequestId: explanationRequestId ?? "request-placeholder" },
    { enabled: false, networkMode: "always", retry: false }
  );
  const approvalQuery = trpc.veridex.approvals.useQuery(
    { actionRequestId: explanationRequestId ?? "request-placeholder" },
    {
      enabled: Boolean(explanationRequestId),
      networkMode: "always",
      retry: false,
    }
  );
  const evidenceQuery = trpc.veridex.evidence.useQuery(
    { actionRequestId: explanationRequestId ?? "request-placeholder" },
    {
      enabled: Boolean(explanationRequestId),
      networkMode: "always",
      retry: false,
    }
  );
  const metadata = metadataQuery.data;
  const selectedResource = useMemo(
    () =>
      metadata?.resources.find(resource => resource.resourceId === resourceId),
    [metadata?.resources, resourceId]
  );
  useEffect(() => {
    void metadataQuery.refetch();
  }, []);
  useEffect(() => {
    if (!metadata) return;
    setAgentId(value => value || metadata.agents[0]?.agentId || "");
    setActionTypeId(
      value => value || metadata.actionTypes[0]?.actionTypeId || ""
    );
    setResourceId(value => value || metadata.resources[0]?.resourceId || "");
  }, [metadata]);
  useEffect(() => {
    if (explainQuery.data) setDecision(explainQuery.data as Decision);
  }, [explainQuery.data]);
  useEffect(() => {
    if (approvalQuery.data) setApproval(approvalQuery.data[0] ?? null);
  }, [approvalQuery.data]);
  useEffect(() => {
    if (evidenceQuery.data) setEvidence(evidenceQuery.data);
  }, [evidenceQuery.data]);
  async function handleEvaluate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsedAmount = Number(amount);
    if (
      !agentId ||
      !actionTypeId ||
      !resourceId ||
      !Number.isFinite(parsedAmount) ||
      parsedAmount <= 0
    ) {
      setValidationError(
        "Choose an agent, action type, and resource, then enter a positive amount."
      );
      return;
    }
    setValidationError(null);
    try {
      const result = (await evaluateMutation.mutateAsync({
        actionTypeId,
        agentId,
        amount: parsedAmount,
        resourceId,
      })) as Decision;
      setDecision(result);
      setExplanationRequestId(result.facts.actionRequest.actionRequestId);
      setApproval(result.governance?.approval ?? null);
      setEvidence(result.governance ? [result.governance.evidence] : []);
      setDeciderUserId(
        result.governance?.approval?.eligibleApprovers[0]?.id ?? ""
      );
    } catch {
      /* Server errors are deliberately safe user-facing tRPC messages. */
    }
  }
  async function handleExplain() {
    if (explanationRequestId) await explainQuery.refetch();
  }
  async function handleApprovalDecision(outcome: "APPROVED" | "REJECTED") {
    if (!approval || !deciderUserId) return;
    try {
      const result = await approvalMutation.mutateAsync({
        approvalId: approval.approvalId,
        deciderUserId,
        outcome,
      });
      setApproval(result.approval);
      setEvidence(current => [...current, result.evidence]);
      void approvalQuery.refetch();
      void evidenceQuery.refetch();
    } catch {
      // The mutation state renders the server's safe failure message.
    }
  }
  return (
    <div className="min-h-screen bg-[#f5f5f2] text-zinc-950">
      <header className="border-b border-zinc-200 bg-[#fafaf8]">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-5 px-5 py-4 sm:px-8 lg:px-12">
          <div className="flex items-center gap-3">
            <div className="grid h-8 w-8 place-items-center bg-zinc-950 text-white">
              <CircleDot className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-semibold tracking-[-0.04em]">
                Veridex
              </p>
              <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                Decision workspace
              </p>
            </div>
          </div>
          <div className="hidden items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500 sm:flex">
            <span className="h-1.5 w-1.5 bg-zinc-900" />
            Deterministic policy engine
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1440px] px-5 py-8 sm:px-8 sm:py-12 lg:px-12">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(420px,1.1fr)] lg:gap-8">
          <section className="border border-zinc-200 bg-white p-6 sm:p-8">
            <SectionHeading
              detail="Submit one action against graph-derived resource and customer context. Demo identities only."
              eyebrow="01 / Evaluate"
              title="Check an automated action"
            />
            {metadataQuery.isLoading ? (
              <div
                aria-label="Loading evaluation controls"
                className="mt-8 space-y-3"
              >
                <div className="h-11 animate-pulse bg-zinc-100" />
                <div className="h-11 animate-pulse bg-zinc-100" />
                <div className="h-11 animate-pulse bg-zinc-100" />
              </div>
            ) : null}
            {metadataQuery.error ? (
              <div
                className="mt-8 border border-zinc-300 bg-zinc-50 p-4"
                role="alert"
              >
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold">
                      The graph workspace is unavailable.
                    </p>
                    <p className="mt-1 text-sm leading-6 text-zinc-600">
                      {metadataQuery.error.message}
                    </p>
                  </div>
                </div>
                <button
                  className="mt-4 inline-flex items-center gap-2 border border-zinc-900 px-3 py-2 text-xs font-semibold active:scale-[0.97]"
                  onClick={() => metadataQuery.refetch()}
                  type="button"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Retry connection
                </button>
              </div>
            ) : null}
            {metadata && metadata.agents.length === 0 ? (
              <div className="mt-8 border border-dashed border-zinc-300 p-5 text-sm text-zinc-600">
                No active demo agents are available. Apply the graph seed before
                evaluating an action.
              </div>
            ) : null}
            {metadata && metadata.agents.length > 0 ? (
              <form className="mt-8 space-y-5" onSubmit={handleEvaluate}>
                <label className="block">
                  <span className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                    Requesting agent
                  </span>
                  <select
                    className="h-12 w-full border border-zinc-300 bg-white px-3 text-sm font-medium outline-none transition focus:border-zinc-900"
                    onChange={event => setAgentId(event.target.value)}
                    value={agentId}
                  >
                    {metadata.agents.map(agent => (
                      <option key={agent.agentId} value={agent.agentId}>
                        {agent.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                    Requested action
                  </span>
                  <select
                    className="h-12 w-full border border-zinc-300 bg-white px-3 text-sm font-medium outline-none transition focus:border-zinc-900"
                    onChange={event => setActionTypeId(event.target.value)}
                    value={actionTypeId}
                  >
                    {metadata.actionTypes.map(actionType => (
                      <option
                        key={actionType.actionTypeId}
                        value={actionType.actionTypeId}
                      >
                        {actionType.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_120px]">
                  <label className="block">
                    <span className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                      Affected resource
                    </span>
                    <select
                      className="h-12 w-full border border-zinc-300 bg-white px-3 text-sm font-medium outline-none transition focus:border-zinc-900"
                      onChange={event => setResourceId(event.target.value)}
                      value={resourceId}
                    >
                      {metadata.resources.map(resource => (
                        <option
                          key={resource.resourceId}
                          value={resource.resourceId}
                        >
                          {resource.resourceName}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                      Amount
                    </span>
                    <input
                      className="h-12 w-full border border-zinc-300 bg-white px-3 text-sm font-medium outline-none transition focus:border-zinc-900"
                      inputMode="decimal"
                      min="0.01"
                      onChange={event => setAmount(event.target.value)}
                      step="0.01"
                      type="number"
                      value={amount}
                    />
                  </label>
                </div>
                {selectedResource ? (
                  <div className="border-l-2 border-zinc-900 bg-zinc-50 px-3.5 py-3 text-xs leading-5 text-zinc-600">
                    <span className="font-semibold text-zinc-900">
                      Graph context:
                    </span>{" "}
                    {selectedResource.customerName} ·{" "}
                    {selectedResource.tierName} tier. This relationship is
                    derived server-side.
                  </div>
                ) : null}
                {validationError ? (
                  <p
                    className="border-l-2 border-zinc-950 bg-zinc-100 px-3 py-2.5 text-sm text-zinc-800"
                    role="alert"
                  >
                    {validationError}
                  </p>
                ) : null}
                {evaluateMutation.error ? (
                  <p
                    className="border-l-2 border-zinc-950 bg-zinc-100 px-3 py-2.5 text-sm text-zinc-800"
                    role="alert"
                  >
                    {evaluateMutation.error.message}
                  </p>
                ) : null}
                <button
                  className="inline-flex w-full items-center justify-between bg-zinc-950 px-4 py-3.5 text-sm font-semibold text-white transition hover:bg-zinc-800 active:scale-[0.97] disabled:cursor-not-allowed disabled:bg-zinc-400"
                  disabled={evaluateMutation.isPending}
                  type="submit"
                >
                  <span>
                    {evaluateMutation.isPending
                      ? "Evaluating graph context…"
                      : "Evaluate action"}
                  </span>
                  {evaluateMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </button>
              </form>
            ) : null}
          </section>
          <section>
            <DecisionPanel
              decision={decision}
              explanationLoading={explainQuery.isFetching}
              onExplain={handleExplain}
            />
          </section>
        </div>
        <div className="mt-8 grid gap-8 xl:grid-cols-[minmax(0,1.25fr)_minmax(310px,0.75fr)]">
          <section className="border-t border-zinc-300 pt-6 sm:pt-8">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <SectionHeading
                eyebrow="02 / Explain"
                title="Relationship path"
              />
              {decision ? (
                <p className="text-xs text-zinc-500">
                  Request {decision.facts.actionRequest.actionRequestId}
                </p>
              ) : null}
            </div>
            <div className="mt-6">
              {decision ? (
                <RelationshipTimeline decision={decision} />
              ) : (
                <div className="border border-dashed border-zinc-300 bg-white px-5 py-8 text-sm text-zinc-500">
                  The evidence path will appear after an action is evaluated.
                </div>
              )}
              {explainQuery.error ? (
                <p
                  className="mt-4 border-l-2 border-zinc-950 bg-zinc-100 px-3 py-2.5 text-sm text-zinc-800"
                  role="alert"
                >
                  {explainQuery.error.message}
                </p>
              ) : null}
            </div>
          </section>
          <GovernancePanel
            approval={approval}
            deciderUserId={deciderUserId}
            error={
              approvalMutation.error?.message ??
              approvalQuery.error?.message ??
              evidenceQuery.error?.message
            }
            evidence={evidence}
            hasRequest={Boolean(explanationRequestId)}
            isLoading={approvalQuery.isFetching || evidenceQuery.isFetching}
            isPending={approvalMutation.isPending}
            onDeciderChange={setDeciderUserId}
            onResolve={handleApprovalDecision}
          />
        </div>
      </main>
    </div>
  );
}
