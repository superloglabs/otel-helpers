import {
  SpanKind,
  metrics,
  type Attributes,
  type Histogram,
  type Meter,
  type Span,
} from "@opentelemetry/api";
import { withSpan, type WithSpanOptions } from "./span.js";

export type GenAiOperationName =
  | "chat"
  | "create_agent"
  | "embeddings"
  | "execute_tool"
  | "generate_content"
  | "invoke_agent"
  | "invoke_workflow"
  | "retrieval"
  | "text_completion"
  | (string & {});

export type GenAiProviderName =
  | "anthropic"
  | "aws.bedrock"
  | "azure.ai.inference"
  | "azure.ai.openai"
  | "cohere"
  | "deepseek"
  | "gcp.gemini"
  | "gcp.gen_ai"
  | "gcp.vertex_ai"
  | "groq"
  | "ibm.watsonx.ai"
  | "mistral_ai"
  | "openai"
  | "perplexity"
  | "x_ai"
  | (string & {});

export type GenAiOutputType = "image" | "json" | "speech" | "text" | (string & {});
export type GenAiTokenType = "input" | "output";

export type GenAiSpanConfig = {
  operation: GenAiOperationName;
  provider: GenAiProviderName;
  requestModel?: string;
  responseModel?: string;
  conversationId?: string;
  outputType?: GenAiOutputType;
  useCase?: string;
  callSite?: string;
  attributes?: Attributes;
  spanName?: string;
};

export type GenAiUsage = {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadInputTokens?: number;
  cacheCreationInputTokens?: number;
  reasoningOutputTokens?: number;
  responseModel?: string;
  finishReasons?: string[];
  costUsd?: number;
};

export type GenAiCostInput = {
  inputTokens?: number;
  outputTokens?: number;
  inputUsdPer1M: number;
  outputUsdPer1M: number;
};

export type GenAiMetrics = {
  tokenUsage: Histogram;
  operationDuration: Histogram;
};

export type GenAiMetricRecorder = {
  metrics: GenAiMetrics;
  operation: GenAiOperationName;
  provider: GenAiProviderName;
  requestModel?: string;
  responseModel?: string;
  useCase?: string;
  callSite?: string;
  durationSeconds?: number;
  inputTokens?: number;
  outputTokens?: number;
};

const defaultMeter = metrics.getMeter("@superlog/otel-helpers");

export function genAiSpanName(config: Pick<GenAiSpanConfig, "operation" | "requestModel">): string {
  return config.requestModel ? `${config.operation} ${config.requestModel}` : config.operation;
}

export function genAiAttributes(config: GenAiSpanConfig & GenAiUsage): Attributes {
  return compactAttributes({
    "gen_ai.operation.name": config.operation,
    "gen_ai.provider.name": config.provider,
    "gen_ai.request.model": config.requestModel,
    "gen_ai.response.model": config.responseModel,
    "gen_ai.conversation.id": config.conversationId,
    "gen_ai.output.type": config.outputType,
    "gen_ai.usage.input_tokens": config.inputTokens,
    "gen_ai.usage.output_tokens": config.outputTokens,
    "gen_ai.usage.cache_read.input_tokens": config.cacheReadInputTokens,
    "gen_ai.usage.cache_creation.input_tokens": config.cacheCreationInputTokens,
    "gen_ai.usage.reasoning.output_tokens": config.reasoningOutputTokens,
    "gen_ai.response.finish_reasons": config.finishReasons,
    "app.gen_ai.use_case": config.useCase,
    "app.gen_ai.call_site": config.callSite,
    "app.gen_ai.cost_usd": config.costUsd,
    ...config.attributes,
  });
}

export async function withGenAiSpan<TResult>(
  config: GenAiSpanConfig,
  fn: (span: Span) => TResult | Promise<TResult>,
  options: WithSpanOptions = {},
): Promise<Awaited<TResult>> {
  return withSpan(config.spanName ?? genAiSpanName(config), fn, {
    ...options,
    kind: options.kind ?? SpanKind.CLIENT,
    attributes: {
      ...genAiAttributes(config),
      ...options.attributes,
    },
  });
}

export function recordGenAiUsage(span: Span, usage: GenAiUsage): void {
  span.setAttributes(genAiAttributes({ operation: "", provider: "", ...usage }));
}

export function createGenAiMetrics(meter: Meter = defaultMeter): GenAiMetrics {
  return {
    tokenUsage: meter.createHistogram("gen_ai.client.token.usage", {
      description: "Measures number of input and output tokens used.",
      unit: "{token}",
    }),
    operationDuration: meter.createHistogram("gen_ai.client.operation.duration", {
      description: "GenAI operation duration.",
      unit: "s",
    }),
  };
}

export function recordGenAiMetrics(input: GenAiMetricRecorder): void {
  const attrs = compactAttributes({
    "gen_ai.operation.name": input.operation,
    "gen_ai.provider.name": input.provider,
    "gen_ai.request.model": input.requestModel,
    "gen_ai.response.model": input.responseModel,
    "app.gen_ai.use_case": input.useCase,
    "app.gen_ai.call_site": input.callSite,
  });

  if (input.inputTokens !== undefined) {
    input.metrics.tokenUsage.record(input.inputTokens, {
      ...attrs,
      "gen_ai.token.type": "input",
    });
  }
  if (input.outputTokens !== undefined) {
    input.metrics.tokenUsage.record(input.outputTokens, {
      ...attrs,
      "gen_ai.token.type": "output",
    });
  }
  if (input.durationSeconds !== undefined) {
    input.metrics.operationDuration.record(input.durationSeconds, attrs);
  }
}

export function estimateGenAiCostUsd(input: GenAiCostInput): number {
  return (
    ((input.inputTokens ?? 0) * input.inputUsdPer1M) / 1_000_000 +
    ((input.outputTokens ?? 0) * input.outputUsdPer1M) / 1_000_000
  );
}

export function anthropicUsage(response: unknown): GenAiUsage {
  const usage = getObject(getObject(response).usage);
  const stopReason = getObject(response).stop_reason;
  return {
    inputTokens: numberOrUndefined(usage.input_tokens),
    outputTokens: numberOrUndefined(usage.output_tokens),
    cacheReadInputTokens: numberOrUndefined(usage.cache_read_input_tokens),
    cacheCreationInputTokens: numberOrUndefined(usage.cache_creation_input_tokens),
    finishReasons: typeof stopReason === "string" ? [stopReason] : undefined,
  };
}

export function openAiUsage(response: unknown): GenAiUsage {
  const obj = getObject(response);
  const usage = getObject(obj.usage);
  const choice = Array.isArray(obj.choices) ? getObject(obj.choices[0]) : {};
  const finishReason = choice.finish_reason;
  return {
    inputTokens: numberOrUndefined(usage.prompt_tokens),
    outputTokens: numberOrUndefined(usage.completion_tokens),
    responseModel: typeof obj.model === "string" ? obj.model : undefined,
    finishReasons: typeof finishReason === "string" ? [finishReason] : undefined,
  };
}

function compactAttributes(attrs: Attributes): Attributes {
  return Object.fromEntries(
    Object.entries(attrs).filter(([, value]) => value !== undefined && value !== null && value !== ""),
  );
}

function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function getObject(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}
