import { systemRouter } from "./_core/systemRouter";
import { router } from "./_core/trpc";
import { veridexRouter } from "./routers/veridex";

export const appRouter = router({
  system: systemRouter,
  veridex: veridexRouter,
});

export type AppRouter = typeof appRouter;
