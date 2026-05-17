# Reincodes — Technical Specification

Personal portfolio and educational app combining interactive data-structure / algorithm visualizers with a RAG-powered travel chatbot.

## 1. Overview

| Field | Value |
|-------|-------|
| Name | reincodes (a.k.a. "Bitdash") |
| Type | Web app (portfolio + educational visualizers + RAG demo) |
| Framework | Next.js 15.1 (App Router), React 19 |
| Language | TypeScript 5.8 |
| Styling | Tailwind CSS 3.4 |
| Hosting | Netlify (serverless functions + static frontend) |
| Database | PostgreSQL (Neon serverless) with `pgvector` |
| ORM | Drizzle ORM 0.44 |
| AI | OpenAI (`text-embedding-ada-002` + `gpt-4.1`) |

## 2. Goals

1. Showcase the author's work and links (portfolio).
2. Teach data structures and algorithms via interactive, animated visualizations.
3. Demonstrate an end-to-end RAG pipeline ("Smart Travel Buddy" for San Francisco).

Non-goals: multi-user accounts, persistence of user state, content management.

## 3. Architecture

```
Browser ──► Next.js (static export + RSC) ──► Netlify Functions ──► Neon Postgres (pgvector)
                                                       │
                                                       └──► OpenAI API (embeddings + chat)
```

- **Frontend:** Next.js App Router, fully client-rendered visualizers (state lives in React).
- **Backend:** Two Netlify serverless functions — no Next.js API routes.
- **Data layer:** Drizzle ORM over Neon HTTP driver. Migrations checked into `migrations/`.
- **Ingestion:** Offline `tsx` script (`bin/ingest.ts`) reads markdown from `data/`, embeds, and writes to Postgres.

## 4. Routes

### 4.1 Pages (`src/app/`)

| Route | Purpose |
|-------|---------|
| `/` | Portfolio landing — bio, GitHub/LinkedIn links |
| `/sorting/{bubble,selection,insertion,merge,quick,heap}-sort` | Animated sorting visualizers; controls for input size and speed |
| `/trees/binary-search-tree` | BST CRUD + traversals (preorder/inorder/postorder) with animated node highlighting |
| `/trees/binary-heap` | Min/max heap + priority queue ops (animation incomplete) |
| `/trees/n-ary-tree` | Stub — not yet implemented |
| `/graphs/network` | D3 network diagram; connected components + cycle detection |
| `/graphs/grid` | BFS / DFS on a grid; click to place obstacles |
| `/graphs/heatmap` | Grid-based heatmap visualization |
| `/graphs/finding-shortest-path` | Dijkstra on a weighted grid |
| `/graphs/river-crossing-puzzle` | Classic puzzle solver via state-space search |
| `/recursions/fibonacci-numbers` | Linear-recursion Fibonacci with call-stack tree |
| `/recursions/count-all-subsets` | Subset enumeration with call-stack tree |
| `/recursions/n-choose-k` | Combinations (partial) |
| `/ai/helloai` | Smart Travel Buddy — RAG chat UI |

### 4.2 Serverless functions (`netlify/functions/`)

| Endpoint | Method | Purpose |
|---|---|---|
| `/.netlify/functions/query` | POST | RAG: embed query → vector search → GPT answer |
| `/.netlify/functions/my-function` | GET/POST/OPTIONS | CORS smoke test |

#### `POST /.netlify/functions/query`

Request:
```json
{ "query": "string", "top_k": 5 }
```

Response:
```json
{ "answer": "string" }
```

Pipeline:
1. Embed `query` via `text-embedding-ada-002` (1536 dims).
2. `SELECT content FROM embeddings ORDER BY embedding <=> $queryVec LIMIT top_k` (cosine distance via pgvector).
3. Concatenate retrieved chunks as `Context:` in a system prompt.
4. Call `gpt-4.1` chat completion; return assistant message as `answer`.

Errors: returns `{ error: string }` with non-200 on missing env, OpenAI failure, or DB failure.

## 5. Data model

### 5.1 `embeddings`

```sql
id          SERIAL PRIMARY KEY
chunk_index INTEGER NOT NULL
content     TEXT NOT NULL
embedding   vector(1536) NOT NULL
created_at  TIMESTAMPTZ DEFAULT now()
```

Index: `ivfflat (embedding vector_cosine_ops) WITH (lists = 100)`.

Population: 100 rows, one per markdown file in `data/` (San Francisco travel guide). Whole file = single chunk; no sub-chunking.

### 5.2 `posts`

```sql
id      INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY
title   VARCHAR(255) NOT NULL
content TEXT NOT NULL DEFAULT ''
```

Currently unused (reserved for future blog/CMS).

### 5.3 Migrations

- `0000_enable-pgvector.sql` — enables `pgvector` extension
- `0001_create-tables.sql` — creates `embeddings`, `posts`
- `0002_create-ivfflat-index.sql` — creates IVFFlat index

## 6. Algorithm implementations (`src/utils/data_structures/`)

| Module | Provides |
|---|---|
| `BinarySearchTree.ts` | `insert`, `search`, `delete`, successor/predecessor, traversals |
| `BinaryHeap.ts` | Min/max heap, heapify-up/down |
| `PriorityQueue.ts` | Heap-backed priority queue |
| `Graph.ts` / `Graph2.ts` | Adjacency list + matrix; BFS/DFS; grid graph builder |
| `Tree.ts` | Generic tree used for recursion call-stack visualization |
| `DijkstrasAlgorithm.ts` | Shortest path on weighted graph |
| `finding_shortest_path/` | Helpers for grid-based pathfinding |
| `River_crossing_puzzles/` | State-space search for puzzle solver |

Companion visual components live under `src/components/` (`ArrayVisualizer`, `BinaryVisualizer`, `CallstackVisualizer`, `GridVisualizer`, `LinearDataVisualizer`, `NetworkDiagram`).

## 7. Configuration

### 7.1 Environment variables

| Variable | Used by | Notes |
|---|---|---|
| `OPENAI_API_KEY` | `bin/ingest.ts` | Ingestion |
| `OPENAI_KEY` | `netlify/functions/query.ts` | Note: name differs from above — inconsistency |
| `DATABASE_URL` | ingest, query function, `db/index.ts` | Primary DB URL |
| `NEON_DATABASE_URL` | `db/index.ts` (fallback) | |
| `NETLIFY_DATABASE_URL` | `drizzle.config.ts` | Drizzle Kit migrations |

No `.env.example` is committed.

### 7.2 Build flags

- `next.config.ts` sets `eslint.ignoreDuringBuilds: true`.
- Dev server uses Turbopack.

## 8. Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Next dev server (Turbopack) |
| `npm run build` / `npm start` | Production build / run |
| `npm run lint` | ESLint |
| `npm run netlify:dev` | Local Netlify environment (functions + frontend) |
| `npm run db:generate` | Generate Drizzle migrations from schema |
| `npm run db:migrate` | Apply migrations (within Netlify env) |
| `npm run db:studio` | Drizzle Studio |
| `npm run ingest` | `tsx bin/ingest.ts <dir>` — embed a directory of markdown files |

## 9. Auth & security

- No authentication. All pages and the `/query` endpoint are public.
- CORS in `my-function.ts` is `Access-Control-Allow-Origin: *`.
- No rate limiting; OpenAI cost is exposed to the public internet via `/query`.

## 10. Known gaps

Incomplete features:
- `/trees/n-ary-tree` is a stub.
- Binary heap animation not wired up.
- Network graph BFS/DFS buttons commented out.
- `n-choose-k` recursion page partial.
- No chat history, multi-turn context, or source attribution in RAG answers.

Tech debt (from in-code TODOs):
- `BinarySearchTree.ts`, `Graph.ts`, `Graph2.ts` flagged for cleanup / dry-run review.
- `NetworkDiagram.tsx` SVG chain methods to be split.
- `graphs/network/page.tsx` author considering rewriting in plain JS/HTML.
- Mixed Python (`.py`) reference implementations alongside TS — not used at runtime.

Operational risks:
- ESLint errors silenced in build.
- `OPENAI_API_KEY` vs `OPENAI_KEY` inconsistency between ingest and query function.
- `gpt-4.1` model id is non-standard — likely should be `gpt-4-turbo` / current model.
- IVFFlat `lists = 100` not tuned to dataset size (only 100 rows).
- No `.env.example`, no input validation on `/query`, no abuse protection.

## 11. Future work (suggested)

1. Add `.env.example` and reconcile `OPENAI_API_KEY` vs `OPENAI_KEY`.
2. Update OpenAI model IDs to current generation (e.g. `gpt-4o` or `claude-*` if migrating).
3. Add request rate limiting + simple API key on `/query`.
4. Sub-chunk large markdown files before embedding; store source path for attribution.
5. Return citations alongside RAG answers.
6. Finish heap animation, n-ary tree, and network-graph traversal buttons.
7. Re-enable ESLint in CI; trim `any` types in data-structure modules.
