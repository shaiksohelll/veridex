import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { CognoDbConfigurationError } from "../cognodb/config";
import { CognoDbUnavailableError, getCognoDbDriver } from "../cognodb/driver";
import { evaluateDecision } from "../decision/evaluator";
import {
  ApprovalConflictError,
  ApprovalEligibilityError,
  decideApproval,
  loadApprovalRecords,
  loadEvidence,
  recordDecisionEvidence,
} from "../graph/governance";
import { loadEvaluationGraphFacts } from "../graph/repository";
import { createActionRequest, loadEvaluationMetadata } from "../graph/requests";
import { publicProcedure, router } from "../_core/trpc";

const identifierSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[a-z0-9-]+$/);
const createAndEvaluateSchema = z.object({
  actionTypeId: identifierSchema,
  agentId: identifierSchema,
  amount: z.number().finite().positive().max(10_000_000),
  resourceId: identifierSchema,
});

function safeDatabaseError(error: unknown): never {
  if (error instanceof CognoDbUnavailableError) {
    throw new TRPCError({
      code: "SERVICE_UNAVAILABLE",
      message: "Database unavailable. Please try again.",
    });
  }
  if (error instanceof CognoDbConfigurationError) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Database configuration is incomplete.",
    });
  }
  throw new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: "Unable to complete the decision request. Please try again.",
  });
}

async function loadDecision(actionRequestId: string) {
  try {
    const facts = await loadEvaluationGraphFacts(
      getCognoDbDriver(),
      actionRequestId
    );
    if (!facts) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Action request was not found.",
      });
    }
    return { facts, decision: evaluateDecision(facts) };
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    return safeDatabaseError(error);
  }
}

const approvalDecisionSchema = z.object({
  approvalId: identifierSchema,
  deciderUserId: identifierSchema,
  outcome: z.enum(["APPROVED", "REJECTED"]),
});

export const veridexRouter = router({
  meta: publicProcedure.query(async () => {
    try {
      return await loadEvaluationMetadata(getCognoDbDriver());
    } catch (error) {
      return safeDatabaseError(error);
    }
  }),

  evaluate: publicProcedure
    .input(createAndEvaluateSchema)
    .mutation(async ({ input }) => {
      try {
        const actionRequest = await createActionRequest(
          getCognoDbDriver(),
          input
        );
        if (!actionRequest) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message:
              "The selected agent, action type, or resource was not found.",
          });
        }
        const result = await loadDecision(actionRequest.actionRequestId);
        const governance = await recordDecisionEvidence(getCognoDbDriver(), {
          agentId: result.facts.primaryAgent.id,
          decision: result.decision,
        });
        return { ...result, governance };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        return safeDatabaseError(error);
      }
    }),

  explain: publicProcedure
    .input(z.object({ actionRequestId: identifierSchema }))
    .query(({ input }) => loadDecision(input.actionRequestId)),

  approvals: publicProcedure
    .input(
      z.object({ actionRequestId: identifierSchema.optional() }).optional()
    )
    .query(async ({ input }) => {
      try {
        return await loadApprovalRecords(
          getCognoDbDriver(),
          input?.actionRequestId
        );
      } catch (error) {
        return safeDatabaseError(error);
      }
    }),

  decideApproval: publicProcedure
    .input(approvalDecisionSchema)
    .mutation(async ({ input }) => {
      try {
        return await decideApproval(getCognoDbDriver(), input);
      } catch (error) {
        if (error instanceof ApprovalConflictError)
          throw new TRPCError({
            code: "CONFLICT",
            message: "This approval has already been decided.",
          });
        if (error instanceof ApprovalEligibilityError)
          throw new TRPCError({
            code: "FORBIDDEN",
            message:
              "The selected user is not eligible to decide this approval.",
          });
        return safeDatabaseError(error);
      }
    }),

  evidence: publicProcedure
    .input(z.object({ actionRequestId: identifierSchema }))
    .query(async ({ input }) => {
      try {
        return await loadEvidence(getCognoDbDriver(), input.actionRequestId);
      } catch (error) {
        return safeDatabaseError(error);
      }
    }),
});
