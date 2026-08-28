import { initTRPC } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    const { stack: _stack, ...safeData } = shape.data;
    if (error.code === "BAD_REQUEST") {
      return {
        ...shape,
        message: "Invalid request. Check the supplied values and try again.",
        data: safeData,
      };
    }
    return {
      ...shape,
      data: safeData,
    };
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;
