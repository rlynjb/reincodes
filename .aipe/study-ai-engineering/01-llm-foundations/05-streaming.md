# Streaming responses (SSE, token-by-token UX)

**Industry name(s):** Streaming, server-sent events (SSE), token-by-token delivery, chunked responses
**Type:** Industry standard

> The mechanism by which the LLM's autoregressive output reaches the client one token (or chunk) at a time, via server-sent events. Perceived latency drops to first-token; total latency stays the same. The right tool for chat UI, the wrong tool for structured-output validation.

**See also:** → [01-what-is-an-llm](01-what-is-an-llm.md) · → [04-structured-outputs](04-structured-outputs.md) · → [06-token-economics](06-token-economics.md) · → [../06-production-serving/](../06-production-serving/)

---

## Why care

### Why care anchored to a frontend primitive

You have a `fetch()` call that returns a JSON response. The browser waits, the request resolves, you `JSON.parse(response)`, you `setState(parsed)`, the UI updates. Total time-to-paint: 800ms — the network round-trip plus the server processing. Now imagine the server takes 30 seconds to produce the response (because an LLM is generating text token-by-token), and your UI shows a spinner for 30 seconds. Users abandon. Streaming is the architectural fix: instead of waiting for the full response, the server sends each token to the client as it's generated. The first token arrives in ~500ms; the rest arrive over the next 30 seconds; the user sees output start appearing at half a second instead of waiting for the spinner. Total compute time is unchanged. *Perceived* time drops by an order of magnitude.

### Move 2 — Name the question

That UX shift has a name — *streaming*. Specifically: server-sent events (SSE) is the transport, and the LLM's autoregressive loop is what makes streaming both possible and worth doing. Each forward pass in the loop produces one token; the server flushes that token to the client immediately rather than buffering until the loop completes. The client receives a sequence of small events, accumulates them, and renders. The question is operational: when does streaming help (long generations, chat UI), when does it hurt (structured-output validation, retry-on-schema-fail flows), and what's the engineering cost of supporting it across the application.

### Move 3 — Why answering that question matters

**Why you need to answer that question at all:** because streaming is the difference between an LLM feature that feels like an LLM feature and one that feels like a broken page load. A 30-second non-streaming chat response is unusable; the same 30-second response streamed is usable. The decision to stream isn't aesthetic — it's product-survival. The engineering cost is non-trivial: streaming changes the client-side state management, breaks naive `JSON.parse()` patterns, complicates error handling mid-stream, and forces the application to handle partial output. I have shipped a chat feature in 2024 where the team tried to avoid streaming because "we just want to wait for the response and render it once." The first user complaint arrived on day three; the streaming retrofit took two weeks because the entire client-side data flow had been designed around full-response semantics. The fix would have taken three days if streaming had been the architecture on day one. The lesson: streaming is a first-class concern in chains whose output is user-facing, and the architectural cost lives on the day the feature ships, not later.

### Move 4 — Concrete before/after

Without streaming:

- 30-second spinner on long generations
- Users abandon at the 5-10 second mark
- No way to interrupt mid-generation ("stop responding")
- `JSON.parse(await response.text())` pattern; everything is post-hoc
- Mobile users on flaky networks see the request timeout before the response arrives

With streaming:

- First token arrives in ~500ms; output appears immediately
- User can interrupt mid-generation via abort signal
- Partial output is visible during long generations
- Client state accumulates incrementally; partial-JSON parsing required for tool-use streams
- Mobile users see something happening within the first network event

### Move 5 — The one-line summary

Streaming is the server-sent-events transport for the LLM's autoregressive output — the server flushes each token to the client as it's generated rather than buffering until the loop completes — analogous to how a `ReadableStream` lets you process data as it arrives instead of waiting for the full response, except the underlying source is a token-by-token model generation loop. The full mechanics are below.

---

## How it works

### Move 1 — The mental model

Streaming is the same autoregressive loop you'd run without streaming, except the server flushes each output token to the client immediately rather than accumulating until the loop terminates. The transport is server-sent events: an HTTP response with `Content-Type: text/event-stream`, where the server writes events in a documented format (`data: {...}\n\n`) and the client reads them with an `EventSource` or via `fetch()` + `ReadableStream`. The client's job is to accumulate the events, parse each one, and update the UI. The autoregressive loop on the server side is identical to the non-streaming case; what changes is the buffering policy.

The strategy: think of streaming as a *delivery layer* on top of the existing inference call. The model's behaviour doesn't change; the latency profile and the client-side state management do.

```
Streaming as a delivery layer on the autoregressive loop

   model forward pass
        │
        ▼
   ┌──────────────────────┐
   │ token N generated    │
   └──────┬───────────────┘
          │
          ▼
   ┌──────────────────────┐
   │ server flushes event │  ← non-streaming: buffers here
   │ to client            │     until loop terminates
   └──────┬───────────────┘
          │
          ▼
   loop until stop_token
   server closes stream
```

### Move 2 — The layered walkthrough

#### The SSE transport

The technical thing: server-sent events is an HTTP/1.1-or-later protocol where the server holds the response open and writes events as they're available. Each event is a UTF-8 text block with `data:` lines followed by a blank line. The client (browser `EventSource` or any HTTP client capable of reading a chunked response) reads events as they arrive. The bridge from frontend: this is the same protocol the browser uses for "long-polling that doesn't suck" — `Server-Sent Events` is older than WebSockets and simpler than them, and is the canonical choice for one-way server-to-client streams. Concrete consequence: SSE works over standard HTTP infrastructure (no protocol upgrade required, unlike WebSockets), is cacheable and proxyable, and handles network interruptions gracefully (the client can reconnect with `Last-Event-ID`). The downside: it's one-way (server-to-client only; the client can't send messages mid-stream without a separate request).

```
SSE wire format (one event)

  data: {"type":"content_block_delta","delta":{"text":"Hello"}}
  
  data: {"type":"content_block_delta","delta":{"text":" world"}}
  
  data: {"type":"message_stop"}
  
  (each event followed by blank line; stream closed by server)
```

#### The provider-specific event shapes

The technical thing: the SSE transport is industry-standard, but each provider defines its own event payload schema. Anthropic's Messages API emits `message_start`, `content_block_start`, `content_block_delta` (with `text_delta` or `input_json_delta` for tool calls), `content_block_stop`, `message_delta` (with usage metrics), and `message_stop`. OpenAI's chat completions emit `chat.completion.chunk` events with `choices[0].delta.content` for text or `choices[0].delta.tool_calls` for tool-use. Google's Gemini emits `GenerateContentResponse` events. The bridge from a DB primitive: this is the equivalent of every database vendor inventing their own wire protocol for query results — the conceptual operation (stream rows as they're available) is universal; the byte-level format is vendor-specific. Concrete consequence: provider-abstraction layers that handle streaming need per-provider event parsers, and cross-provider migrations involve more than swapping the API endpoint. The Anthropic SDK and OpenAI SDK both abstract this away on the client side; rolling your own client code means implementing per-provider parsers.

#### Partial JSON parsing for tool calls

The technical thing: when the model emits a tool call under streaming, the tool's arguments arrive as a stream of partial JSON. The client receives `{"city": "San` then `Francis` then `co"}` across three events. Naive `JSON.parse()` on the partial string fails until the full payload arrives. The bridge from a frontend primitive: this is the equivalent of trying to render an image while only the first few KB of its bytes have arrived — you need a *progressive* parser that handles incomplete input. Concrete consequence: structured-output streaming requires a streaming JSON parser (`jsonparse-next`, `partial-json-parser`, `incremental-json-parser`) on the client side. Without it, the application has two options: (a) wait for the stream to complete before parsing (which defeats the latency benefit), or (b) accumulate the text and try to parse periodically (which is what most production systems do). Neither is as clean as the standard `JSON.parse()` model.

```
streaming tool-call arguments — partial JSON across events

  event 1: {"city": "San
  event 2:                Francis
  event 3:                       co", "units": 
  event 4:                                     "metric"}

  cumulative buffer at each event:
    e1: {"city": "San                         ← parse fails
    e2: {"city": "SanFrancis                  ← parse fails
    e3: {"city": "SanFrancisco", "units":     ← parse fails
    e4: {"city": "SanFrancisco", "units": "metric"}  ← parse succeeds
    
  use a streaming/partial JSON parser if you need to render before complete
```

#### When streaming helps vs hurts

The technical thing: streaming is the right architecture for long, user-facing generations (chat, summarisation, content creation) and the wrong architecture for short, code-consumed outputs (classification, extraction, structured outputs you validate-then-act-on). The bridge from a CRUD primitive: this is the same logic as deciding when to use cursor-based pagination vs full-result-set query — streaming is for "show progress as data arrives"; non-streaming is for "give me the answer, I have downstream logic that needs the whole thing." Concrete consequence: chains that produce structured output for downstream code generally shouldn't stream because (a) you can't validate the schema until the stream completes anyway, (b) you can't retry on schema failure mid-stream, (c) the chain's job is producing a value, not displaying progress. Chains that produce text for users generally should stream because the perceived-latency benefit is enormous and the partial-output rendering is a feature, not a bug.

```
when streaming earns its place              when it doesn't
─────────────────────────────              ─────────────────────────────
chat / conversational UI                   classification chain
long-form content generation               extraction chain
summarisation with > 5s latency            structured-output validation chain
agent loops with progress UI               retry-on-schema-fail flows
mobile UX where any progress = retention   background batch jobs
                                           short, deterministic outputs
```

#### The first-token vs total-latency tradeoff

The technical thing: streaming optimises for *first-token latency* (TTFT — time to first token) at the cost of zero — *total* latency is approximately the same as non-streaming. The bridge from frontend: this is the same tradeoff as showing a skeleton UI while data loads — total load time doesn't change, but perceived load time drops because the user has something to look at. Concrete consequence: TTFT becomes the primary latency SLO for streaming chains. Prompt caching, model selection, and prompt size all influence TTFT (a cached prompt skips the input forward pass; a smaller model has faster TTFT; a shorter prompt has shorter prefill phase). Total latency is still governed by the autoregressive loop and output token count, but it's no longer the metric that determines whether users abandon.

### Move 3 — The principle

The principle that generalises beyond any one transport: *perceived latency is the real latency for user-facing features.* The user doesn't care about wall-clock time to total completion; they care about how long they stare at a spinner. Streaming is the architectural acknowledgment that the model's output is generated progressively and that progressive delivery to the client is a UX requirement, not an optimisation. Once you have that framing, "should we stream?" becomes "is this user-facing?" and the answer is straightforwardly yes (with the structured-output exception noted above). The history of LLM-powered UX is the history of teams shipping non-streaming first, hitting abandonment, and retrofitting streaming; the senior move is shipping streaming from the start when the chain is user-facing.

The full picture is below.

---

## Streaming responses — diagram

```
┌─ Non-streaming (full buffer) ────────────────────────────────────────┐
│                                                                       │
│   client                       server                       model    │
│     │ ── POST /messages ─────▶ │                                     │
│     │                          │ ─ loop ─▶ token 1 (50ms)            │
│     │                          │ ─ loop ─▶ token 2 (50ms)            │
│     │                          │ ─ loop ─▶ ... (28 sec total)        │
│     │                          │ ─ loop ─▶ token N + stop            │
│     │ ◀── full response ───── │                                     │
│     │ render at t=28s          │                                     │
│                                                                       │
│   TTFT: 28s  |  Total: 28s  |  Spinner: 28s                          │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘
                              vs
┌─ Streaming (SSE) ────────────────────────────────────────────────────┐
│                                                                       │
│   client                       server                       model    │
│     │ ── POST /messages ─────▶ │                                     │
│     │      stream: true        │                                     │
│     │                          │ ─ loop ─▶ token 1 (50ms)            │
│     │ ◀── event: token 1 ──── │   flush                              │
│     │ render at t=0.5s         │ ─ loop ─▶ token 2 (50ms)            │
│     │ ◀── event: token 2 ──── │   flush                              │
│     │ append                   │ ─ loop ─▶ ... (continues)           │
│     │ ◀── event: token N ──── │                                     │
│     │ render typewriter        │ ─ loop ─▶ token N + stop            │
│     │ ◀── event: message_stop  │                                     │
│                                                                       │
│   TTFT: 0.5s  |  Total: 28s  |  Spinner: 0.5s, then progress visible │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘
```

The boundary between the upper diagram (non-streaming, single render after full buffer) and the lower diagram (streaming, progressive render per event) is what makes the architectural decision concrete: total compute is the same; the user-visible experience is fundamentally different.

---

## In this codebase

**Not yet implemented.** reincodes is a Next.js static-export DSA visualizer with no AI surface in production code — there are zero LLM calls, no streaming infrastructure, no SSE handlers. The existing study guide (`.aipe/study-ai-engineering/`) positions reincodes as the *interview-prep visualizer host* per the curriculum: a place to *teach* AI concepts through visualizers, not a place where AI runs for users. The buildable target for this concept is below in Project exercises — a `/ai/streaming` page that takes one precomputed response and renders it three ways (no streaming = full text appears on click; streaming = token-by-token typewriter via `delayLoop`; chunked-streaming = paragraphs appear together) with a perceived-latency comparison clock running on each.

**Expected file paths** (when built):
- `src/app/ai/streaming/page.tsx` — the visualizer page
- `src/components/StreamingVisualizer/` — three-mode side-by-side renderer, per-mode latency clock, mode selector
- `public/ai/streaming/example-response.json` — one precomputed `(prompt, tokens[], paragraph_boundaries[])` record captured at build time by `scripts/precompute-streaming.ts`

---

## Elaborate

### Where this pattern comes from

Server-sent events landed in the HTML5 spec in 2009 and predates the LLM era by more than a decade. Long-polling, comet, and ad-hoc streaming patterns existed before that. The LLM industry's adoption of SSE was natural: the autoregressive loop produces tokens incrementally, the network already supports incremental delivery, and the UX win is obvious. OpenAI's chat completions API supported streaming from launch (March 2023); Anthropic's Messages API has supported it since the public release of the API (2023). The streaming-or-not decision in 2026 is almost always streaming for any user-facing chain; the question has shifted from "should we stream" to "how do we handle structured-output chains where streaming hurts more than it helps."

### The deeper principle

The deeper principle is that *progressive delivery matches progressive generation.* The model generates token-by-token; the transport should deliver token-by-token; the UI should render token-by-token. Any mismatch in granularity — full buffer on the transport, full buffer on the UI — introduces artificial latency. The same principle applies in other domains: video streaming, progressive image formats, JIT compilation, incremental DOM diffing. Streaming the LLM is the same idea, applied to the LLM boundary. Once you have this framing, the question of whether to stream becomes a question of whether the consumer can handle progressive input — and the answer for user-facing UIs is always yes, while the answer for downstream code that needs the full output is no.

### Where this breaks down

The streaming framing breaks down at four edges. First, structured-output validation: if the chain's contract is "return a Zod-validated object," you can't validate until the stream completes, so streaming gains nothing and adds complexity. Second, error recovery: a stream that fails mid-output is harder to recover from than a full-response failure. The application has to decide whether to render the partial output, retry from scratch, or attempt to continue from where the stream broke (continuation isn't supported by most providers). Third, mobile networks with bad connectivity: SSE doesn't degrade gracefully on flaky connections; a dropped connection halts the stream and the retry semantics aren't standardised. Fourth, billing visibility: streaming responses still get billed for total token count, but the usage metrics arrive only in the final event. Mid-stream, the caller doesn't know how much they've spent — which complicates rate limiting and budget enforcement.

### What to explore next

- [01-what-is-an-llm](01-what-is-an-llm.md) → streaming is the delivery layer on the autoregressive loop
- [04-structured-outputs](04-structured-outputs.md) → structured-output chains and streaming interact awkwardly; partial JSON parsing required if both
- [06-token-economics](06-token-economics.md) → output token count is the cost driver; streaming doesn't change cost, only perceived latency
- [../06-production-serving/](../06-production-serving/) → production streaming requires handling reconnection, abort signals, rate limits

---

## Tradeoffs

### Comparison table — both costs in one frame

```
┌──────────────────┬──────────────────────┬─────────────────────────┐
│ Cost dimension   │ Path taken           │ Alternative             │
│                  │ (stream by default   │ (full response only)    │
│                  │  for user-facing)    │                         │
├──────────────────┼──────────────────────┼─────────────────────────┤
│ TTFT (UX)        │ ~500ms — output     │ 5-30s spinner            │
│                  │ appears immediately  │                         │
│ Total latency    │ Same as non-stream   │ Same as stream          │
│ Client complexity│ SSE parser + state   │ Standard fetch+JSON     │
│                  │ accumulator + abort  │ parse                   │
│ Error handling   │ Mid-stream failures, │ Single failure point    │
│                  │ partial output       │                         │
│ Mobile / flaky   │ Resilient (events    │ Single point of failure │
│ networks         │ arrive incrementally)│                         │
│ Abort / interrupt│ Native (close stream)│ Not supported (wait or  │
│                  │                      │ abandon)                │
│ Structured output│ Partial JSON parser  │ Standard parse on full  │
│                  │ required             │ response                │
│ Rate limit / cost│ Usage arrives in     │ Usage in single response│
│ visibility       │ final event only     │                         │
│ Bundle / infra   │ SSE handlers, abort  │ Simpler                 │
│                  │ controllers, partial │                         │
│                  │ parsers              │                         │
│ User abandonment │ Low (immediate feed- │ High (long spinner)     │
│                  │ back)                │                         │
└──────────────────┴──────────────────────┴─────────────────────────┘
```

### What we gave up (when planning the reincodes visualizer)

The first cost is *making the three modes feel realistic*. The visualizer's teaching value depends on the side-by-side feeling like a real comparison of latency profiles. Non-streaming has to genuinely show a spinner for ~5-10 seconds (using `setTimeout` to simulate the wait); streaming has to render token-by-token at a rate consistent with real production streams (~30-60 tokens/second); chunked-streaming has to render in paragraph-sized bursts. Calibrating the timing so the visualizer doesn't feel artificial is half a day of work, and the timings have to be parameterised (a "speed" control) so the reader can compare at slow speeds for clarity and fast speeds for realism.

The second cost is *capturing paragraph boundaries in the precomputed response*. The chunked-streaming mode shows that real production sometimes buffers at paragraph or semantic boundaries rather than emitting per-token. To render this honestly, the precomputed JSON needs paragraph boundary indices computed at build time (either from the model's output structure or by post-processing splits on `\n\n`). That's a small additional capture step, but it's an extra column in the data schema that the visualizer component has to handle.

The third cost is *teaching scope across browsers*. SSE is well-supported in modern browsers, but the visualizer doesn't use real SSE — it uses `delayLoop` over a precomputed token array to simulate streaming. A reader who understands the visualizer might think "I now understand SSE" when in fact they understand the *user experience* of streaming, not the *wire protocol*. The accompanying text needs to clarify that the visualizer demonstrates the UX shift, not the protocol details. The protocol details live in this written file's "How it works" section.

### What the alternative would have cost (skipping the visualizer)

If reincodes never builds the `/ai/streaming` visualizer, the cost is *zero* in the codebase. The concept gets taught in this written study guide; the curriculum's Phase 1 reading covers it; loopd's chains are noted as non-streaming in the curriculum (`[C1.5]`: streaming, learn-only because loopd has no streaming). The reincodes site stays pure-DSA.

The cost of *not* building it shows up in the interview-prep surface. Of the nine concepts in this sub-section, streaming is one of the easier to demonstrate verbally ("first token at 500ms instead of 30 seconds"), but the side-by-side visualization makes the perceived-latency point land in a way that words don't. Without the visualizer, the candidate has to gesture at the UX cost; with it, they can demonstrate it.

### The breakpoint

The visualizer earns its place during interview rounds where the candidate is asked "how do you handle long-generation LLM features?" The verbal answer ("streaming via SSE, partial output rendering") is correct but generic; the visual answer ("watch this — same response, three delivery modes, here's where the user gives up in each") is specific. The breakpoint is event-shaped: an interview that pushes on the UX side of LLM engineering rather than the model side.

### What wasn't actually a tradeoff

Live LLM streaming in the visualizer was not a real option. The static-export contract forbids backend infrastructure, which forbids the server-side SSE endpoint that real streaming requires. The simulated-streaming-via-`delayLoop` approach isn't a downgrade from "real" streaming — it's the only architecture compatible with the deploy story, and for a teaching artifact, the UX of streaming is what matters, not the SSE wire format.

---

## Tech reference (industry pairing)

### Anthropic Messages API (streaming)

- **Codebase uses:** not yet — the planned `/ai/streaming` visualizer would call `claude-sonnet-4-7` with `stream: true` at build time to capture a realistic token-by-token output, then persist the token sequence + paragraph boundaries to JSON for client-side playback.
- **Why it's here:** Anthropic's streaming API exposes the autoregressive loop cleanly — each token arrives in a `content_block_delta` event with the text delta, and the final `message_delta` event carries usage metrics. The data model maps directly onto the visualizer's needs.
- **Leading today:** Anthropic Messages API streaming — `adoption-leading` for production LLM streaming work, 2026.
- **Why it leads:** clean event schema (`message_start`, `content_block_delta`, `message_stop`), tool-call streaming with `input_json_delta` events for partial JSON, stable since 2023.
- **Runner-up:** OpenAI Chat Completions streaming — `adoption-leading` in raw deployments; the `delta` shape on `chat.completion.chunk` is industry-standard but the event schema is less explicit than Anthropic's.

### OpenAI Chat Completions (streaming)

- **Codebase uses:** not yet — would be the secondary precompute target if the visualizer captures cross-provider examples to show that the streaming UX is the same regardless of provider.
- **Why it's here:** the chat-completions streaming format (`chat.completion.chunk` events with `choices[0].delta.content`) is the format every other framework's streaming abstraction emulates. Understanding it is required to integrate any LLM streaming framework.
- **Leading today:** OpenAI Chat Completions streaming — `adoption-leading` for raw deployments and the most-supported format across libraries, 2026.
- **Why it leads:** the format every framework's streaming abstraction defaults to; broadest SDK coverage; the `[DONE]` sentinel that signals stream end is well-known.
- **Runner-up:** Vercel AI SDK — `innovation-leading` for unified streaming across providers in Next.js applications; abstracts the per-provider event shapes behind a common interface; particularly relevant in this codebase's Next.js context.

### Vercel AI SDK

- **Codebase uses:** not yet — but uniquely relevant because reincodes is a Next.js app. If the static-export constraint were ever lifted and reincodes shipped live streaming, Vercel's AI SDK would be the natural client library because it integrates with Next.js server components and edge functions.
- **Why it's here:** the Vercel AI SDK is the canonical streaming abstraction for Next.js applications. It handles SSE parsing across providers, exposes a `useChat` hook for client components, and integrates with Next.js's streaming response support. Even though the static-export constraint makes it currently irrelevant, naming it makes the future migration path explicit.
- **Leading today:** Vercel AI SDK — `adoption-leading` for streaming in Next.js applications, 2026.
- **Why it leads:** Next.js-native, supports all major providers under one abstraction, batteries-included for tool calling and structured outputs over streaming, large ecosystem of examples and integrations.
- **Runner-up:** LangChain's streaming abstractions — `adoption-leading` for cross-framework work but heavier; bundle size matters less server-side but the SDK is more opinionated about chain composition.

---

## Project exercises

### [B-reincodes-streaming-viz] Build the streaming visualizer

- **Exercise ID:** `[B-reincodes-streaming-viz]` — derived from the curriculum's "Interview prep surface — reincodes" entry and Phase 1 concept `[C1.5]` (Streaming responses, marked learn-only because loopd doesn't stream).
- **What to build:** a page at `/ai/streaming` that takes one precomputed LLM response and renders it three ways in three side-by-side panels. Panel 1: no streaming — click "submit," see a spinner for the realistic full-response duration, then the full text appears at once. Panel 2: token-by-token streaming — click "submit," each token appears with a small delay via `delayLoop` to simulate ~40 tokens/second. Panel 3: chunked streaming — click "submit," text appears in paragraph-sized chunks at ~5 chunks/second. A clock per panel shows elapsed time and labels "TTFT" (time to first content) and "total" (time to complete). A "submit all three at once" button lets the reader watch the comparison in real time. A speed slider scales all timings together.
- **Why it earns its place:** the visualizer makes the *perceived-latency win* observable — the reader clicks "submit" and watches Panel 1 hold a spinner while Panels 2 and 3 are already rendering. The TTFT-vs-total comparison becomes visceral. The interview signal is that the candidate built a teaching artifact for the most user-visible LLM UX decision.
- **Files to touch:** `src/app/ai/streaming/page.tsx` (visualizer page), `src/components/StreamingVisualizer/` (three-mode renderer using `delayLoop`, per-mode latency clock, speed slider, submit-all button), `public/ai/streaming/example-response.json` (precomputed (prompt, tokens[], paragraph_boundaries[]) record), `scripts/precompute-streaming.ts` (build-time script that calls Anthropic with `stream: true`, captures the token sequence, computes paragraph boundaries, persists JSON). Add a row to `src/components/Home/conceptsData.tsx`'s category list under a new `ai-engineering` category.
- **Done when:** the page loads at `/reincodes/ai/streaming/` in production (GitHub Pages), three modes render in sync when "submit all" is clicked, individual mode submission works, latency clocks update correctly per mode, speed slider scales all timings, `next build` passes under `output: "export"`. Build script runs against the actual Anthropic API locally and produces a stable example trace. Mobile layout stacks the three panels vertically without losing the comparison.
- **Estimated effort:** 1-2 days. Precompute script: half day. Three-mode renderer + delayLoop integration: half day. Latency clocks + speed slider: half day. Submit-all coordination + mobile layout: half day.

---

## Summary

### Part 1 — concept recap

Streaming is the server-sent-events transport for the LLM's autoregressive output — the server flushes each token to the client as it's generated rather than buffering until the loop completes. Total latency is unchanged; perceived latency (time-to-first-token) drops by an order of magnitude. Each provider defines its own event schema (Anthropic: `content_block_delta`; OpenAI: `chat.completion.chunk`), but the conceptual contract is the same. Streaming is the right architecture for long, user-facing generations (chat, summarisation, content creation) and the wrong architecture for short, code-consumed outputs (classification, extraction, structured-output validation) because partial JSON can't be schema-validated until complete. In this codebase the concept is *planned* rather than implemented: reincodes has no LLM surface, and the buildable target is a `/ai/streaming` visualizer that simulates three delivery modes (full buffer, token-by-token, chunked) over a precomputed response using `delayLoop`.

### Part 2 — key points to remember

- **The transport**: server-sent events (SSE). Standard HTTP, one-way server-to-client, cacheable, proxyable. Older than WebSockets, simpler than them.
- **The provider matrix**: Anthropic uses `content_block_delta` events. OpenAI uses `chat.completion.chunk` events. Google uses `GenerateContentResponse` events. SDKs abstract this.
- **TTFT vs total**: streaming optimises TTFT (time to first token) at zero impact on total latency. Perceived latency is the real latency for user-facing features.
- **When not to stream**: structured-output chains, classification, extraction, anything code-consumed. Schema validation requires the full output anyway.
- **The reincodes shape**: implementation is Case B; the buildable target is a three-mode visualizer under `/ai/streaming` simulating non-streaming, token-by-token, and chunked delivery over a precomputed response.

---

## Interview defense

### What an interviewer is really asking

Behind "how does LLM streaming work?" the interviewer is checking whether the candidate has shipped a streaming feature and felt the engineering cost. A junior answer says "the model returns tokens one at a time and you display them." A senior answer names SSE as the transport, names TTFT vs total latency, names the structured-output exception, and names a specific case where the team had to choose between streaming and not. The interviewer is checking for the operational framing because streaming touches the entire client-side data flow and is the single most user-visible architectural decision in an LLM-powered feature.

### Likely questions

**Q (mid):** What's the difference between streaming and non-streaming from the user's perspective?

A: Total time is roughly the same; perceived time is dramatically different. A non-streaming response that takes 30 seconds shows a spinner for 30 seconds, after which the full response appears at once. A streaming response that takes 30 seconds total starts displaying output within the first second; the user sees the response building up as it's generated. The user's mental experience of "30 seconds of waiting" becomes "30 seconds of reading," which is fundamentally different from a UX standpoint. Streaming is what makes chat-style LLM features feel responsive; without it, every conversation looks like a hung page. The architectural cost is non-trivial — SSE parsing, partial-output state management, abort signal handling, partial JSON parsing for tool calls — but the UX cost of not streaming is much higher.

```
non-streaming                       streaming
─────────────────                  ──────────────────
30s spinner                        500ms TTFT, output building visibly
single render at completion        progressive render
no interrupt                       abort signal closes stream
simple state                       state accumulates per event
high user abandonment              low abandonment
```

**Q (senior):** A chain in production needs to return a structured JSON object that downstream code validates. Should it stream?

A: No. Three reasons. First, you can't validate the schema until the stream completes — Zod parsing requires the full object — so the application logic that consumes the chain's output can't act on partial state. Second, if the schema validation fails (the model emits invalid JSON or violates the schema), you have to either retry from scratch or accept the failure, and neither benefits from having received partial output along the way. Third, the user isn't reading the JSON anyway — the JSON feeds downstream code, and the downstream code wants the value, not the progress. Streaming a JSON-output chain pays the engineering cost of streaming (SSE parsing, partial JSON handling) for zero UX benefit. The right answer: non-streaming for the chain, streaming only on the user-facing chain that *consumes* the JSON-output chain's result and produces user-facing text. The structured chain runs first, non-streaming, validates; the text chain runs second, streams to the user.

```
chain composition with streaming                non-streaming structured chain
─────────────────────────────────              ──────────────────────────────
chain A (classifier) → returns JSON             non-streaming
chain B (response generator) → streams text     streams
                                                
user clicks "submit" → spinner for ~2s         ← chain A runs
                    → text appears immediately ← chain B streams
                    → text continues building   ← still streaming
```

**Q (arch):** At 10× scale — a chat application with 100k concurrent streaming connections — what changes architecturally?

A: Three architectural concerns at 100k concurrent streams. First, connection limits: SSE holds an HTTP connection open for the duration of the stream, and most application servers have per-instance concurrency limits (Node.js default is ~5k, can be tuned higher; AWS API Gateway has a hard cap of 10k per region). At 100k concurrent, the load balancer fans out across many instances and the per-instance concurrency budget needs to be measured and tuned. Second, mid-stream interruption: 100k connections means non-zero rate of mid-stream disconnects (mobile users on flaky networks, page navigations). The server needs to detect closed connections and stop billing the model for tokens nobody's receiving — most providers support stream-cancellation via abort signals, but the application has to plumb them through. Third, observability: a streaming response's "duration" is meaningless as a single number — the relevant metrics are TTFT (P50, P95, P99), total duration (P50, P95, P99), output token rate (tokens/second during the stream), and disconnect rate. The monitoring dashboard has to be streaming-aware, not just request-response-aware.

```
1k concurrent                      100k concurrent
─────────────                      ─────────────────
single app instance                 fleet of instances behind LB
"is the stream slow?"               TTFT P50/P95/P99 + tokens/sec
ignore disconnects                  detect + cancel model generation
HTTP/1.1 fine                       HTTP/2 multiplexing for connection density
no per-user limits                  per-user rate limit, abort on overflow
```

### The question candidates always dodge

**Q:** Why don't we just use WebSockets instead of SSE? They're more flexible, support bidirectional traffic, and are the modern standard.

A: WebSockets are the right answer for bidirectional, low-latency, real-time applications (multiplayer games, collaborative editors, trading platforms). LLM streaming is one-way (server-to-client) and tolerates higher latency (the user is reading, not gaming). The flexibility WebSockets offer is unused, and the cost is higher: WebSocket requires a protocol upgrade (HTTP/1.1 → WS), doesn't go through HTTP caches or proxies cleanly, requires custom server infrastructure to handle the persistent connections, and has worse browser support for things like `EventSource`'s automatic reconnection with `Last-Event-ID`. SSE is the right tool for the LLM streaming job because it matches the job's actual shape: one-way, append-only, recoverable on reconnect. The cost ledger:

```
SSE                                 WebSocket
─────────────                       ──────────────
+ HTTP/1.1 native                    + bidirectional
+ proxyable, cacheable               + lower per-message overhead
+ automatic reconnection             - protocol upgrade required
+ EventSource API in browser         - HTTP cache/proxy don't apply
- one-way only                       - custom infra for connection mgmt
                                    - reconnection logic is on you
                                    - flexibility you don't use for LLM
```

The honest answer: "WebSockets are more powerful but the power is irrelevant for LLM streaming, and the irrelevant power costs operational complexity." The candidate who defaults to WebSockets because they're "more modern" is the candidate who doesn't measure the job against the tool.

### One-line anchors

- "Total latency is the same; perceived latency drops to TTFT. Perceived latency is the real latency for user-facing features."
- "SSE is the transport. Server-sent events. Standard HTTP, one-way, proxyable, recoverable."
- "Stream user-facing chains (chat, summarisation). Don't stream code-consumed chains (classification, extraction)."
- "Partial JSON parsing required for tool-call streaming. Standard JSON.parse doesn't handle incomplete input."
- "TTFT P95 is the new latency SLO for streaming chains. Total latency is a secondary metric."

---

## Validate your understanding

### Level 1 — Reconstruct the diagram

Close this file. Draw the streaming vs non-streaming diagram from memory: client/server/model lanes, the timing of events in each mode, and the perceived-latency contrast (TTFT vs total). Label SSE as the transport.

✓ Pass: three lanes, event timing shown, TTFT vs total contrast clear
✗ Fail: re-read the primary diagram, wait 10 minutes, try again.

### Level 2 — Explain it out loud

Explain streaming to a colleague who has only ever made non-streaming `fetch()` calls to an LLM API. No notes. Under 90 seconds.

Checkpoints — did you:
- Name SSE as the transport?
- Distinguish TTFT from total latency?
- Name one chain class where streaming is wrong (structured outputs, classification, extraction)?
- Reference the buildable target (`/ai/streaming` visualizer) as how you'd demonstrate the concept in reincodes?

If you skipped any: you described the mechanism, you didn't argue for when to use it.

### Level 3 — Apply it to a new scenario

A teammate proposes a "real-time AI suggestions" feature where the LLM analyzes the user's typing and suggests completions as they type. They want to "stream the suggestions back to the UI for instant feedback." Lay out the streaming architecture: what should stream, what shouldn't, what's the TTFT target, and what does the abort-signal flow look like when the user types another keystroke before the previous stream finishes?

Write your answer (3–5 sentences minimum). Then check whether your proposed architecture matches the constraints `00-overview.md` names for any planned AI feature in reincodes (static-export contract, precomputed corpus, no live LLM at request time).

### Level 4 — Defend the decision you'd change

Pick the biggest tradeoff from the Tradeoffs section. Answer in writing: "If I were starting the `/ai/streaming` visualizer today with the same constraints (static export, no live LLM, GH Pages deploy), would I still simulate streaming with `delayLoop` rather than implementing real SSE? Why or why not? If I'd change it, what would I do instead — a serverless function fronting the stream? — and what would that cost in deploy complexity?"

Reference the actual code:
→ Point to `next.config.ts` L7 (`output: "export"`) to support the static-export constraint
→ Point to what would need to change for real SSE — `next.config.ts` loses `output: "export"`, deploy target shifts off GH Pages, a serverless function holds the SSE connection

There is no right answer. The point is specificity.

### Quick check — code reference test

Without opening any files, answer:
- What file in reincodes controls the static-export contract that constrains how the visualizer ships?
- What reincodes utility is reused to simulate the per-token delay in the visualizer?
- What field in `conceptsData.tsx` would need a new entry to register the streaming visualizer in the home grid?

Then open the files and verify.

✓ Pass: `next.config.ts`, `delayLoop` (in `src/utils/delayLoop.ts`), `ConceptCategory[]` (the exported array)
✗ Fail on details: that's fine — the shape is what matters. File and utility names should be recoverable.
