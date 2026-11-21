import { describe, it, expect, afterEach } from "vitest";
import { llmConfig, GEMINI_DEFAULT_MODEL } from "../src/lib/server-config";
import { describeHttpFailure } from "../src/lib/llm";

const KEYS = ["LLM_API_KEY", "LLM_BASE_URL", "LLM_MODEL"] as const;
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
const setEnv = (v: Partial<Record<(typeof KEYS)[number], string>>) => {
  for (const k of KEYS) delete process.env[k];
  Object.assign(process.env, v);
};
afterEach(() => { for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });

describe("LLM provider address", () => {
  it("sends a Google key to Google when no address is set", () => {
    setEnv({ LLM_API_KEY: "AIzaTestKey" });
    const c = llmConfig();
    expect(c.baseUrl).toBe("https://generativelanguage.googleapis.com/v1beta/openai");
    expect(c.model).toBe(GEMINI_DEFAULT_MODEL);
  });

  it("corrects a Google key paired with the OpenAI defaults from .env.example", () => {
    setEnv({ LLM_API_KEY: "AIzaTestKey", LLM_BASE_URL: "https://api.openai.com/v1", LLM_MODEL: "gpt-4o-mini" });
    const c = llmConfig();
    expect(c.baseUrl).toContain("generativelanguage.googleapis.com");
    expect(c.model).toBe(GEMINI_DEFAULT_MODEL);
  });

  it("keeps an explicit non-OpenAI address and Gemini model", () => {
    setEnv({ LLM_API_KEY: "AIzaTestKey", LLM_BASE_URL: "http://127.0.0.1:4999/v1", LLM_MODEL: "gemini-x" });
    const c = llmConfig();
    expect(c.baseUrl).toBe("http://127.0.0.1:4999/v1");
    expect(c.model).toBe("gemini-x");
  });

  it("leaves OpenAI keys on OpenAI", () => {
    setEnv({ LLM_API_KEY: "sk-test" });
    const c = llmConfig();
    expect(c.baseUrl).toBe("https://api.openai.com/v1");
    expect(c.model).toBe("gpt-4o-mini");
  });
});

describe("provider error messages", () => {
  it("never echo the provider's response, and explain a rejected key", () => {
    expect(describeHttpFailure(401)).toMatch(/rejected the API key/);
    expect(describeHttpFailure(401)).not.toMatch(/AIza|sk-/);
    expect(describeHttpFailure(404)).toMatch(/not found/);
    expect(describeHttpFailure(503)).toMatch(/unavailable/);
  });
});
