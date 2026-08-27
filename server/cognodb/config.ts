export type CognoDbConfig = {
  uri: string;
  username: string;
  password: string;
  database?: string;
};

type Environment = Record<string, string | undefined>;

export class CognoDbConfigurationError extends Error {
  readonly code = "COGNODB_CONFIGURATION_INVALID";

  constructor(message: string) {
    super(message);
    this.name = "CognoDbConfigurationError";
  }
}

function requiredValue(environment: Environment, name: string): string {
  const value = environment[name]?.trim();

  if (!value) {
    throw new CognoDbConfigurationError(`Missing required server configuration: ${name}.`);
  }

  return value;
}

function validateBoltUri(uri: string): void {
  let parsed: URL;

  try {
    parsed = new URL(uri);
  } catch {
    throw new CognoDbConfigurationError("COGNODB_URI must be a valid Bolt URI.");
  }

  const acceptedProtocols = new Set(["bolt:", "bolt+s:", "bolt+ssc:"]);
  if (!acceptedProtocols.has(parsed.protocol)) {
    throw new CognoDbConfigurationError("COGNODB_URI must use a Bolt protocol.");
  }
}

/**
 * Reads database credentials only from the server environment. The function is
 * intentionally invoked at runtime so local tooling can run without secrets.
 */
export function parseCognoDbConfig(environment: Environment = process.env): CognoDbConfig {
  const uri = requiredValue(environment, "COGNODB_URI");
  validateBoltUri(uri);

  return {
    uri,
    username: environment.COGNODB_USERNAME?.trim() || "cognodb",
    password: requiredValue(environment, "COGNODB_PASSWORD"),
    database: environment.COGNODB_DATABASE?.trim() || undefined,
  };
}
