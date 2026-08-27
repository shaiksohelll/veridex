import { afterAll, describe, expect, it } from "vitest";
import { parseCognoDbConfig } from "./config";
import {
  closeCognoDbDriver,
  createCognoDbDriver,
  getCognoDbDriver,
  verifyCognoDbConnectivity,
} from "./driver";

const hasCognoDbCredentials = Boolean(process.env.COGNODB_URI && process.env.COGNODB_PASSWORD);

describe("CognoDB driver integration", () => {
  it.runIf(hasCognoDbCredentials)(
    "verifies connectivity through the official Neo4j-compatible driver",
    async () => {
      await expect(verifyCognoDbConnectivity(getCognoDbDriver())).resolves.toBeUndefined();
    },
    15_000,
  );

  it.runIf(hasCognoDbCredentials)("uses CognoDB's provider default database", async () => {
      const config = parseCognoDbConfig({
        ...process.env,
        COGNODB_DATABASE: "should-not-be-used",
      });
      expect(config).not.toHaveProperty("database");

      const driver = createCognoDbDriver(config);
      const session = driver.session();

      try {
        await expect(driver.verifyConnectivity()).resolves.toBeUndefined();
        const result = await session.run("RETURN 1 AS reachable");
        expect(result.records[0]?.get("reachable")).toBe(1);
      } finally {
        await session.close();
        await driver.close();
      }
    });

  afterAll(async () => {
    await closeCognoDbDriver();
  });
});
