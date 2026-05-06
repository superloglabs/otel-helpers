import { describe, expect, it, vi } from "vitest";
import {
  anthropicUsage,
  estimateGenAiCostUsd,
  genAiAttributes,
  genAiSpanName,
  openAiUsage,
  recordGenAiMetrics,
} from "../src/index.js";

describe("GenAI helpers", () => {
  it("builds OTel GenAI span names", () => {
    expect(genAiSpanName({ operation: "chat", requestModel: "claude-sonnet-4-5" })).toBe(
      "chat claude-sonnet-4-5",
    );
  });

  it("maps friendly fields to OTel GenAI attributes", () => {
    expect(
      genAiAttributes({
        operation: "chat",
        provider: "anthropic",
        requestModel: "claude",
        responseModel: "claude",
        inputTokens: 10,
        outputTokens: 20,
        finishReasons: ["end_turn"],
        useCase: "stylist",
        callSite: "initial",
      }),
    ).toEqual({
      "gen_ai.operation.name": "chat",
      "gen_ai.provider.name": "anthropic",
      "gen_ai.request.model": "claude",
      "gen_ai.response.model": "claude",
      "gen_ai.usage.input_tokens": 10,
      "gen_ai.usage.output_tokens": 20,
      "gen_ai.response.finish_reasons": ["end_turn"],
      "app.gen_ai.use_case": "stylist",
      "app.gen_ai.call_site": "initial",
    });
  });

  it("extracts Anthropic usage", () => {
    expect(
      anthropicUsage({
        usage: {
          input_tokens: 11,
          output_tokens: 22,
          cache_read_input_tokens: 3,
        },
        stop_reason: "end_turn",
      }),
    ).toEqual({
      inputTokens: 11,
      outputTokens: 22,
      cacheReadInputTokens: 3,
      cacheCreationInputTokens: undefined,
      finishReasons: ["end_turn"],
    });
  });

  it("extracts OpenAI usage", () => {
    expect(
      openAiUsage({
        model: "gpt-5.1",
        usage: {
          prompt_tokens: 12,
          completion_tokens: 34,
        },
        choices: [{ finish_reason: "stop" }],
      }),
    ).toEqual({
      inputTokens: 12,
      outputTokens: 34,
      responseModel: "gpt-5.1",
      finishReasons: ["stop"],
    });
  });

  it("estimates cost from explicit pricing", () => {
    expect(
      estimateGenAiCostUsd({
        inputTokens: 1_000_000,
        outputTokens: 1_000_000,
        inputUsdPer1M: 3,
        outputUsdPer1M: 15,
      }),
    ).toBe(18);
  });

  it("records token metrics with official token type attributes", () => {
    const tokenUsage = { record: vi.fn() };
    const operationDuration = { record: vi.fn() };

    recordGenAiMetrics({
      metrics: { tokenUsage, operationDuration },
      operation: "chat",
      provider: "anthropic",
      requestModel: "claude",
      inputTokens: 10,
      outputTokens: 20,
      durationSeconds: 0.5,
    });

    expect(tokenUsage.record).toHaveBeenCalledWith(10, {
      "gen_ai.operation.name": "chat",
      "gen_ai.provider.name": "anthropic",
      "gen_ai.request.model": "claude",
      "gen_ai.token.type": "input",
    });
    expect(tokenUsage.record).toHaveBeenCalledWith(20, {
      "gen_ai.operation.name": "chat",
      "gen_ai.provider.name": "anthropic",
      "gen_ai.request.model": "claude",
      "gen_ai.token.type": "output",
    });
    expect(operationDuration.record).toHaveBeenCalledWith(0.5, {
      "gen_ai.operation.name": "chat",
      "gen_ai.provider.name": "anthropic",
      "gen_ai.request.model": "claude",
    });
  });
});
