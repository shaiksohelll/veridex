import { afterAll, describe, expect, it } from "vitest";
import { closeCognoDbDriver, getCognoDbDriver, verifyCognoDbConnectivity } from "./driver";

const hasCognoDbCredentials = Boolean(process.env.COGNODB_URI && process.env.COGNODB_PASSWORD);

describe("CognoDB driver integration", () => {
  it.runIf(hasCognoDbCredentials)("verifies connectivity through the official Neo4j-compatible driver", async () => {
    await expect(verifyCognoDbConnectivity(getCognoDbDriver())).resolves.toBeUndefined();
  });

  afterAll(async () => {
    await closeCognoDbDriver();
  });
});
