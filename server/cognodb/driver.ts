import neo4j, { type Driver } from "neo4j-driver";
import { type CognoDbConfig, parseCognoDbConfig } from "./config";

export class CognoDbUnavailableError extends Error {
  readonly code = "COGNODB_UNAVAILABLE";

  constructor() {
    super("CognoDB is unavailable.");
    this.name = "CognoDbUnavailableError";
  }
}

let cachedDriver: Driver | undefined;

/** Creates the official Neo4j-compatible driver for server-side use only. */
export function createCognoDbDriver(config: CognoDbConfig): Driver {
  return neo4j.driver(uriOrThrow(config), neo4j.auth.basic(config.username, config.password), {
    connectionAcquisitionTimeout: 5_000,
    disableLosslessIntegers: true,
    maxConnectionPoolSize: 10,
    maxTransactionRetryTime: 5_000,
  });
}

function uriOrThrow(config: CognoDbConfig): string {
  return config.uri;
}

/** Reuses one driver instance, while opening and closing sessions per operation. */
export function getCognoDbDriver(): Driver {
  if (!cachedDriver) {
    cachedDriver = createCognoDbDriver(parseCognoDbConfig());
  }

  return cachedDriver;
}

export async function verifyCognoDbConnectivity(driver = getCognoDbDriver()): Promise<void> {
  try {
    await driver.verifyConnectivity();
  } catch {
    throw new CognoDbUnavailableError();
  }
}

export async function closeCognoDbDriver(): Promise<void> {
  if (cachedDriver) {
    await cachedDriver.close();
    cachedDriver = undefined;
  }
}
