import { SpanStatusCode } from "@opentelemetry/api";
import { describe, expect, it, vi } from "vitest";
import { recordSpanError, spanErrorAttributes, withSpan } from "../src/index.js";

describe("span helpers", () => {
  it("records low-cardinality error.type", () => {
    expect(spanErrorAttributes(Object.assign(new Error("boom"), { name: "RateLimitError" }))).toEqual(
      {
        "error.type": "RateLimitError",
      },
    );
  });

  it("records exception and error status", () => {
    const span = {
      recordException: vi.fn(),
      setStatus: vi.fn(),
      setAttributes: vi.fn(),
    };
    const err = new Error("boom");

    recordSpanError(span as never, err);

    expect(span.recordException).toHaveBeenCalledWith(err);
    expect(span.setStatus).toHaveBeenCalledWith({ code: SpanStatusCode.ERROR });
    expect(span.setAttributes).toHaveBeenCalledWith({ "error.type": "Error" });
  });

  it("runs callback using a supplied tracer and ends spans", async () => {
    const span = {
      end: vi.fn(),
    };
    const tracer = {
      startActiveSpan: vi.fn((_name, _options, fn) => fn(span)),
    };

    const result = await withSpan("work", () => "ok", { tracer: tracer as never });

    expect(result).toBe("ok");
    expect(tracer.startActiveSpan).toHaveBeenCalledWith(
      "work",
      expect.objectContaining({ kind: 0 }),
      expect.any(Function),
    );
    expect(span.end).toHaveBeenCalled();
  });
});
