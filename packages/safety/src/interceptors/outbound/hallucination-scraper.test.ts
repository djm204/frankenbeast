import { describe, it, expect } from "vitest";
import { scrapeHallucinations } from "./hallucination-scraper.js";
import type { UnifiedResponse } from "../../types/index.js";

const BASE_RESPONSE: UnifiedResponse = {
  schema_version: 1,
  id: "msg-001",
  model_used: "claude-sonnet-4-6",
  content: null,
  tool_calls: [],
  finish_reason: "stop",
  usage: { input_tokens: 10, output_tokens: 5, cost_usd: 0.0001 },
};

const WHITELIST = ["react", "express", "lodash", "zod"];

describe("HallucinationScraper", () => {
  it("PASS — all imports in content exist in whitelist", () => {
    const response = {
      ...BASE_RESPONSE,
      content: `import React from 'react';\nimport { z } from 'zod';`,
    };
    const result = scrapeHallucinations(response, WHITELIST);
    expect(result.passed).toBe(true);
  });

  it("FLAG — import references package absent from whitelist", () => {
    const response = {
      ...BASE_RESPONSE,
      content: `import { foo } from 'ghost-package-xyz';`,
    };
    const result = scrapeHallucinations(response, WHITELIST);
    expect(result.passed).toBe(false);
    if (!result.passed) {
      expect(result.violations[0]?.code).toBe("HALLUCINATION_DETECTED");
      expect(result.violations[0]?.interceptor).toBe("HallucinationScraper");
      expect(result.violations[0]?.payload?.["package"]).toBe("ghost-package-xyz");
    }
  });

  it("FLAG — require() of package absent from whitelist", () => {
    const response = {
      ...BASE_RESPONSE,
      content: `const db = require('phantom-orm');`,
    };
    const result = scrapeHallucinations(response, WHITELIST);
    expect(result.passed).toBe(false);
    if (!result.passed) {
      expect(result.violations.some((v) => String(v.payload?.["package"]).includes("phantom-orm"))).toBe(true);
    }
  });

  it("PASS — content with no import or path references", () => {
    const response = {
      ...BASE_RESPONSE,
      content: "The capital of France is Paris.",
    };
    const result = scrapeHallucinations(response, WHITELIST);
    expect(result.passed).toBe(true);
  });

  it("PASS — empty whitelist disables scraping entirely", () => {
    const response = {
      ...BASE_RESPONSE,
      content: `import { foo } from 'any-package-at-all';`,
    };
    const result = scrapeHallucinations(response, []);
    expect(result.passed).toBe(true);
  });

  it("PASS — null content is not scraped", () => {
    const result = scrapeHallucinations({ ...BASE_RESPONSE, content: null }, WHITELIST);
    expect(result.passed).toBe(true);
  });

  it("PASS — scoped package with whitelisted root passes", () => {
    const whitelist = ["react", "@company/design-system"];
    const response = {
      ...BASE_RESPONSE,
      content: `import Button from '@company/design-system/Button';`,
    };
    // Scoped packages use the full @scope/name as their root — not whitelisted here
    const result = scrapeHallucinations(response, whitelist);
    // @company/design-system is in the whitelist — should pass
    expect(result.passed).toBe(true);
  });
});
