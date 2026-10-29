import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";

type EnvironmentName = "development" | "test" | "staging" | "production";
type LogFormat = "json" | "text";

type RuntimeEnv = {
  ENVIRONMENT: EnvironmentName;
  LOG_FORMAT: LogFormat;
  PORT: number;
  HOST: string;
  DB_URL: string;
  BETTER_AUTH_URL: string;
  BETTER_AUTH_SECRET: string;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL: string;
  OPENAI_BASE_URL: string;
  OPENAI_TOKEN_LIMIT_FIELD: "max_completion_tokens" | "max_tokens";
  AI_MAX_OUTPUT_TOKENS: number;
  AI_TIMEOUT_MS: number;
  AI_REQUESTS_PER_MINUTE: number;
  AI_MAX_CONCURRENT_REQUESTS: number;
};

type EnvSource = Record<string, string | undefined>;

const envFile = new URL("../../../.env", import.meta.url);
const envReferencePattern = /\$([A-Z0-9_]+)/g;
let envSourceCache: EnvSource | null = null;

export const env = new Proxy({} as RuntimeEnv, {
  get(_target, property) {
    return readRuntimeEnvValue(property as keyof RuntimeEnv);
  },
}) as RuntimeEnv;

export function invalidateEnvForTesting() {
  envSourceCache = null;
}

function readRuntimeEnvValue(key: keyof RuntimeEnv) {
  switch (key) {
    case "ENVIRONMENT":
      return parseEnvironment(readOptionalValue("ENVIRONMENT"));
    case "LOG_FORMAT":
      return readOptionalValue("LOG_FORMAT") === "json" ? "json" : "text";
    case "PORT":
      return parseInteger(readOptionalValue("PORT"), 3000);
    case "HOST":
      return readOptionalValue("HOST") || "127.0.0.1";
    case "DB_URL":
      return readRequiredValue("DB_URL");
    case "BETTER_AUTH_URL":
      return readRequiredValue("BETTER_AUTH_URL");
    case "BETTER_AUTH_SECRET": {
      const secret = readRequiredValue("BETTER_AUTH_SECRET");
      if (secret.length < 32) {
        throw new Error("BETTER_AUTH_SECRET must be at least 32 characters.");
      }
      if (
        readOptionalValue("ENVIRONMENT") === "production" &&
        (secret.includes("change-me") || secret.includes("generate-a-random-secret"))
      ) {
        throw new Error("BETTER_AUTH_SECRET must be changed in production.");
      }
      return secret;
    }
    case "OPENAI_API_KEY":
      return readOptionalValue("OPENAI_API_KEY");
    case "OPENAI_MODEL":
      return readOptionalValue("OPENAI_MODEL") || "gpt-5-nano";
    case "OPENAI_BASE_URL": {
      const value = readOptionalValue("OPENAI_BASE_URL") || "https://api.openai.com/v1";
      const url = new URL(value);
      if (
        !["http:", "https:"].includes(url.protocol) ||
        url.username ||
        url.password ||
        url.search ||
        url.hash
      ) {
        throw new Error(
          "OPENAI_BASE_URL must be an HTTP(S) URL without credentials, query or fragment.",
        );
      }
      return value;
    }
    case "OPENAI_TOKEN_LIMIT_FIELD": {
      const value = readOptionalValue("OPENAI_TOKEN_LIMIT_FIELD") || "max_completion_tokens";
      if (value !== "max_tokens" && value !== "max_completion_tokens") {
        throw new Error("OPENAI_TOKEN_LIMIT_FIELD must be max_completion_tokens or max_tokens.");
      }
      return value;
    }
    case "AI_MAX_OUTPUT_TOKENS":
      return parseInteger(readOptionalValue(key), 4096);
    case "AI_TIMEOUT_MS":
      return parseInteger(readOptionalValue(key), 120_000);
    case "AI_REQUESTS_PER_MINUTE":
      return parseInteger(readOptionalValue(key), 10);
    case "AI_MAX_CONCURRENT_REQUESTS":
      return parseInteger(readOptionalValue(key), 8);
    default:
      throw new Error(`Unsupported environment key: ${String(key)}`);
  }
}

function getEnvSource(): EnvSource {
  if (!envSourceCache) {
    const fileEnv = existsSync(envFile) ? parseEnv(readFileSync(envFile, "utf8")) : {};
    envSourceCache = { ...fileEnv, ...process.env };
  }

  return envSourceCache;
}

function readOptionalValue(key: string): string | undefined {
  const value = getEnvSource()[key];
  if (typeof value !== "string") return undefined;
  return value.replace(envReferencePattern, (_match, referenceName: string) => {
    const referenceValue = readOptionalValue(referenceName);
    if (referenceValue === undefined)
      throw new Error(`Missing referenced environment variable: ${referenceName}`);
    return referenceValue;
  });
}

function readRequiredValue(key: string): string {
  const value = readOptionalValue(key);
  if (!value || value.trim() === "") {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function parseEnvironment(value: string | undefined): EnvironmentName {
  if (!value || value === "") return "development";
  if (
    value === "development" ||
    value === "test" ||
    value === "staging" ||
    value === "production"
  ) {
    return value;
  }
  throw new Error(`Invalid ENVIRONMENT: ${value}`);
}

function parseInteger(value: string | undefined, fallback: number): number {
  if (!value || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 2_147_483_647) {
    throw new Error("Integer environment values must be positive 32-bit integers.");
  }
  return parsed;
}

export type { RuntimeEnv };
