import "dotenv/config";
import { closeCognoDbDriver, getCognoDbDriver, verifyCognoDbConnectivity } from "../server/cognodb/driver";
import { seedGraph } from "../server/graph/seed";

async function main(): Promise<void> {
  const driver = getCognoDbDriver();
  await verifyCognoDbConnectivity(driver);
  await seedGraph(driver);
  console.info("CognoDB seed applied successfully.");
}

main()
  .catch(() => {
    console.error("CognoDB seeding failed. Verify server configuration and database availability.");
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeCognoDbDriver();
  });
