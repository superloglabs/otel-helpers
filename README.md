# @superlog/otel-helpers

[![npm](https://img.shields.io/npm/v/@superlog/otel-helpers?color=2E4BFF&label=npm)](https://www.npmjs.com/package/@superlog/otel-helpers)
[![npm downloads](https://img.shields.io/npm/dm/@superlog/otel-helpers?color=2E4BFF)](https://www.npmjs.com/package/@superlog/otel-helpers)
[![CI](https://img.shields.io/github/actions/workflow/status/superloglabs/otel-helpers/ci.yml?branch=main&label=CI)](https://github.com/superloglabs/otel-helpers/actions)
[![License: MIT](https://img.shields.io/badge/license-MIT-2E4BFF)](LICENSE)
[![Node >=18](https://img.shields.io/badge/node-%3E%3D18-2E4BFF)](package.json)

Tiny TypeScript helpers for native OpenTelemetry.

- Add spans with minimal diff impact
- Record LLM costs

```sh
npm i @superlog/otel-helpers @opentelemetry/api
```

## `withSpan`

`withSpan` allows you to create a span around a function in a way that is easy to review.
Here is the same `handleCheckout` instrumented two ways.

Original:

```ts
async function handleCheckout(orderId: string) {
  const order = await loadOrder(orderId);
  await chargeCard(order);
  return order;
}
```

Vanilla OpenTelemetry SDK:

```diff
--- original.ts
+++ manual.ts
@@ -1,5 +1,20 @@
+import { trace, SpanStatusCode } from "@opentelemetry/api";
+
+const tracer = trace.getTracer("checkout");
+
 async function handleCheckout(orderId: string) {
-  const order = await loadOrder(orderId);
-  await chargeCard(order);
-  return order;
+  return tracer.startActiveSpan("api.checkout", async (span) => {
+    try {
+      span.setAttribute("order.id", orderId);
+      const order = await loadOrder(orderId);
+      await chargeCard(order);
+      return order;
+    } catch (err) {
+      span.recordException(err as Error);
+      span.setStatus({ code: SpanStatusCode.ERROR });
+      throw err;
+    } finally {
+      span.end();
+    }
+  });
 }
```

Notice that:
- The entire function is indented, creating a long diff hunk. 
  - The reviewer needs to visually compare versions to analyze changes.
- The try/catch block creates code changes around the key logic of the function.

Here's the diff produced by `withSpan`:

```diff
--- original.ts
+++ helper.ts
@@ -1,5 +1,8 @@
-async function handleCheckout(orderId: string) {
+import { withSpan } from "@superlog/otel-helpers";
+
+const handleCheckout = withSpan("api.checkout", async (span, orderId: string) => {
+  span.setAttribute("order.id", orderId);
   const order = await loadOrder(orderId);
   await chargeCard(order);
   return order;
-}
+});
```

- The diff is now purely additive
- It is easy to identify the scope of the changes and their potential impact.

## GenAI spans

- Creates spans and metrics for LLM calls 
- Respects OTel Semantic conventions

```ts
import { withGenAiSpan, recordGenAiUsage, anthropicUsage } from "@superlog/otel-helpers";

const response = await withGenAiSpan(
  {
    operation: "chat",
    provider: "anthropic",
    requestModel: MODEL,
    useCase: "stylist",
    callSite: "initial",
  },
  async (span) => {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      tools,
      messages,
    });

    recordGenAiUsage(span, anthropicUsage(res));
    return res;
  },
);
```

The package emits current OpenTelemetry GenAI semantic convention attributes:

- `gen_ai.operation.name`
- `gen_ai.provider.name`
- `gen_ai.request.model`
- `gen_ai.response.model`
- `gen_ai.usage.input_tokens`
- `gen_ai.usage.output_tokens`
- `gen_ai.response.finish_reasons`

The GenAI semantic conventions are currently marked Development by OpenTelemetry. This package follows the current names, and keeps product-specific dimensions under `app.gen_ai.*`.

## Publishing a new version

Tag a release. GitHub Actions publishes to npm with provenance:

```sh
pnpm version patch   # or minor / major
git push origin main --tags
```

## License

MIT
