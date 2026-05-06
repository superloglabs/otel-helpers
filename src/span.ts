import {
  SpanKind,
  SpanStatusCode,
  trace,
  type Attributes,
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

export function spanErrorAttributes(err: unknown): Attributes {
  return {
    "error.type": errorType(err),
  };
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
