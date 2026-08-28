import { createExpressMiddleware } from "@trpc/server/adapters/express";
import express from "express";
import { verifyCognoDbConnectivity } from "../cognodb/driver";
import { appRouter } from "../routers";
import { createContext } from "./context";

const REQUEST_BODY_LIMIT = "100kb";

type AppOptions = {
  readinessCheck?: () => Promise<void>;
};

/**
 * Builds the HTTP application independently of the listener so deployment
 * probes can be verified without opening a production server.
 */
export function createApp({
  readinessCheck = verifyCognoDbConnectivity,
}: AppOptions = {}) {
  const app = express();

  app.use(express.json({ limit: REQUEST_BODY_LIMIT }));
  app.use(express.urlencoded({ extended: true, limit: REQUEST_BODY_LIMIT }));

  app.get("/healthz", (_request, response) => {
    response.status(200).json({ status: "ok" });
  });

  app.get("/readyz", async (_request, response) => {
    try {
      await readinessCheck();
      response.status(200).json({ status: "ready" });
    } catch {
      response.status(503).json({ status: "unavailable" });
    }
  });

  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );

  return app;
}
