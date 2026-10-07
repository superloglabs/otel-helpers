import {
  SpanKind,
  SpanStatusCode,
  trace,
  type Attributes,
  type AttributeValue,
  type Span,
  type SpanOptions,
  type Tracer,
} from "@opentelemetry/api";

const defaultTracer = trace.getTracer("@superlog/otel-helpers");

export type WithSpanOptions = Omit<SpanOptions, "attributes" | "kind"> & {
  attributes?: Attributes;
  kind?: SpanKind;
  tracer?: Tracer;
};

export async function withSpan<TResult>(
  name: string,
  fn: (span: Span) => TResult | Promise<TResult>,
  options: WithSpanOptions = {},
): Promise<Awaited<TResult>> {
  const { tracer = defaultTracer, attributes, kind = SpanKind.INTERNAL, ...spanOptions } = options;

  const result = await tracer.startActiveSpan(name, { ...spanOptions, attributes, kind }, async (span) => {
    try {
      return await fn(span);
    } catch (err) {
      recordSpanError(span, err);
      throw err;
    } finally {
      span.end();
    }
  });
  return result as Awaited<TResult>;
}

export function recordSpanError(span: Span, err: unknown): void {
  span.recordException(toException(err));
  span.setStatus({ code: SpanStatusCode.ERROR });
  span.setAttributes(spanErrorAttributes(err));
}

export function setSpanAttributesSafe(
  span: Span,
  attributes: Record<string, unknown>,
): number {
  let count = 0;

  for (const [key, value] of Object.entries(attributes)) {
    if (key.length === 0 || !isAttributeValue(value)) continue;
    span.setAttribute(key, value);
    count += 1;
  }

  return count;
}

export function spanErrorAttributes(err: unknown): Attributes {
  return {
    "error.type": errorType(err),
  };
}

function isAttributeValue(value: unknown): value is AttributeValue {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return true;
  }

  if (!Array.isArray(value)) return false;
  if (value.length === 0) return true;

  const elementType = typeof value[0];
  if (
    elementType !== "string" &&
    elementType !== "number" &&
    elementType !== "boolean"
  ) {
    return false;
  }

  return value.every((item) => typeof item === elementType);
}

function toException(err: unknown): Error {
  if (err instanceof Error) return err;
  return new Error(typeof err === "string" ? err : JSON.stringify(err));
}

function errorType(err: unknown): string {
  if (err instanceof Error) return err.name || "Error";
  if (typeof err === "object" && err !== null) {
    const maybeCode = (err as { code?: unknown }).code;
    if (typeof maybeCode === "string" && maybeCode.length > 0) return maybeCode;
  }
  return typeof err;
}
