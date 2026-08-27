import { describe, expect, it } from "vitest";
import { CognoDbConfigurationError, parseCognoDbConfig } from "./config";

describe("parseCognoDbConfig", () => {
  it("accepts the standard Bolt configuration without exposing secrets", () => {
    const config = parseCognoDbConfig({
      COGNODB_PASSWORD: "test-password",
      COGNODB_URI: "bolt+s://example.databases.cognodb.cloud",
      COGNODB_USERNAME: "cognodb",
    });

    expect(config).toEqual({
      password: "test-password",
      uri: "bolt+s://example.databases.cognodb.cloud",
      username: "cognodb",
    });
  });

  it("does not use a non-standard database override", () => {
    const config = parseCognoDbConfig({
      COGNODB_DATABASE: "should-not-be-used",
      COGNODB_PASSWORD: "test-password",
      COGNODB_URI: "bolt+s://example.databases.cognodb.cloud",
    });

    expect(config).not.toHaveProperty("database");
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
