import { describe, expect, it } from "vitest";
import { CognoDbConfigurationError, parseCognoDbConfig } from "./config";

describe("parseCognoDbConfig", () => {
  it("accepts a complete Bolt configuration without exposing secrets", () => {
    const config = parseCognoDbConfig({
      COGNODB_DATABASE: "main",
      COGNODB_PASSWORD: "test-password",
      COGNODB_URI: "bolt+s://example.databases.cognodb.cloud",
      COGNODB_USERNAME: "cognodb",
    });

    expect(config).toEqual({
      database: "main",
      password: "test-password",
      uri: "bolt+s://example.databases.cognodb.cloud",
      username: "cognodb",
    });
  });

  it("uses CognoDB's documented default username when none is supplied", () => {
    const config = parseCognoDbConfig({
      COGNODB_PASSWORD: "test-password",
      COGNODB_URI: "bolt+s://example.databases.cognodb.cloud",
    });

    expect(config.username).toBe("cognodb");
  });

  it("fails safely when required configuration is absent or malformed", () => {
    expect(() => parseCognoDbConfig({ COGNODB_URI: "https://example.com" })).toThrow(
      CognoDbConfigurationError,
    );
    expect(() => parseCognoDbConfig({ COGNODB_PASSWORD: "test-password" })).toThrow(
      "COGNODB_URI",
    );
  });
});
