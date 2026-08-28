import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";

/**
 * Request context for every tRPC procedure. Veridex has no authenticated
 * identity: the seeded graph users are demo data resolved server-side per
 * request, never a session. Any future authentication must be added
 * deliberately rather than by reintroducing a scaffold session cookie.
 */
export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
};

export function createContext(opts: CreateExpressContextOptions): TrpcContext {
  return {
    req: opts.req,
    res: opts.res,
  };
}
