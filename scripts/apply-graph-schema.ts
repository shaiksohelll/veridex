import "dotenv/config";
import { closeCognoDbDriver, getCognoDbDriver, verifyCognoDbConnectivity } from "../server/cognodb/driver";
import { applyGraphSchema } from "../server/graph/schema";

async function main(): Promise<void> {
  const driver = getCognoDbDriver();
  await verifyCognoDbConnectivity(driver);
  await applyGraphSchema(driver);
  console.info("CognoDB schema applied successfully.");
}

main()
  .catch(() => {
    console.error("CognoDB schema setup failed. Verify server configuration and database availability.");
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeCognoDbDriver();
  });
