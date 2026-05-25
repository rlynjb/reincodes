# Static export architecture

**Industry name(s):** Static site generation (SSG), pre-rendering, ahead-of-time compilation, "JAMstack"
**Type:** Industry standard · Language-agnostic

> Every route in this Next.js app is compiled to plain HTML + JS at build time and uploaded to a CDN; there is no Node process running in production.

**See also:** → [02-page-per-route-app-router.md](./02-page-per-route-app-router.md) · → [03-client-component-boundary.md](./03-client-component-boundary.md)

---

## Why care

#### Move 1 — The grounded scenario

You've shipped a Next.js app before. The Vercel preview goes up, you hit the URL, and somewhere a Node process is sitting there waiting to render a page when the request arrives. You can `console.log` in `getServerSideProps` and watch it appear in the deploy logs. The server is part of the production. If it dies at 3am, the site dies with it.

Now picture the same app, but the deploy step produces a `out/` folder full of `.html` and `.js` files, and that folder gets dumped onto a static file host. No Node running anywhere. A browser asks for `/reincodes/sorting/bubble-sort/` and a CDN sends back a pre-built HTML file the same way it would send a `.png`. The same React components, the same routes — but the production runtime is gone.

#### Move 2 — Name the question (or job) the pattern answers

The question the scenario sets up is: *if there's no server, what runs the app?* The answer is "static export" — Next.js builds every route ahead of time, ships the resulting HTML + JS bundles to a CDN, and the only runtime is the browser. Not a server you scaled down. Not a server that wakes up on demand. *No server at all in production.*

#### Move 3 — Why answering that question matters

**What you trade for that:** every primitive that assumes a server runtime is off the table. No `getServerSideProps`. No API routes under `pages/api/` or `app/api/`. No server components reading a database. No request-time secrets, because there are no requests hitting your code — only requests hitting a CDN serving files. The contract is *the build produces every byte the production user will see, and after the build there is nothing left to run on your side.*

In this codebase, that contract is exactly what makes GitHub Pages hosting viable. GitHub Pages serves files out of a branch. There is no compute. If the app tried to call an API route at runtime, it would 404 — there is no handler on the other end.

#### Move 4 — Concrete before/after

Without static export, with a typical Next.js Vercel deploy:

- A user hits `/sorting/bubble-sort` → request arrives at a Node process
- The framework runs server-side rendering for that route, possibly calls an upstream API
- Response is rendered HTML, streamed back to the user
- Hosting bill scales with traffic; cold starts add 100–400ms on idle routes
- You can read query params at render time, gate by auth, fetch live data

With static export (this codebase):

- `npm run build` runs once on a GitHub Actions runner, emits `out/bubble-sort/index.html` plus chunked JS
- A user hits `/reincodes/sorting/bubble-sort/` → GitHub Pages CDN returns the pre-built HTML
- React hydrates in the browser; every interaction (the actual algorithm step-through) runs client-side
- Hosting bill: $0. Cold starts: none, because there's no warm/cold compute — it's all files
- You cannot read query params at render time, gate by auth, or fetch live secrets — those concepts have nowhere to live

#### Move 5 — The one-line summary

Static export is `next build` running once on a CI runner and producing the same `out/` directory you'd get from `vite build` or `astro build` — Next.js without the Node runtime, frozen at the moment of build.

---

## How it works

### Move 1 — The mental model

The mental model is one config flag flipping Next.js from "ship a runtime" to "ship files." Everything else in the codebase follows from that one flag.

```
       next.config.ts                       what gets shipped
┌─────────────────────────────┐      ┌──────────────────────────────┐
│ output: "export"            │ ───▶ │ out/                         │
│ basePath: "/reincodes"      │      │   index.html                 │
│ assetPrefix: "/reincodes"   │      │   sorting/bubble-sort/       │
│ images.unoptimized: true    │      │     index.html               │
│ trailingSlash: true         │      │   _next/static/chunks/*.js   │
└─────────────────────────────┘      └──────────────────────────────┘
                                       no server, no functions, no API
```

The strategy in one sentence: *one config flag decides Next.js's deploy target is a file server, and every other config option exists to make that file server work on GitHub Pages specifically.*

### Move 2 — The layered walkthrough

**The `output: "export"` flag**

The single load-bearing line is `output: "export"` in `next.config.ts`. With that flag set, `next build` does not produce a `.next/` directory you ship to a Node server — it produces an `out/` directory of HTML and JS.

If you're coming from frontend, you're used to `vite build` or `webpack build` producing a `dist/` folder of static assets. `output: "export"` is Next.js doing exactly that. It is the *opt-out* from the Next.js server runtime, which is normally the default.

```
Default Next.js build                     With output: "export"
─────────────────────────                ─────────────────────────
.next/                                   out/
  server/pages/...   ◀── needs node       index.html
  static/chunks/...                       sorting/bubble-sort/
                                            index.html
  → deploy to:                            _next/static/chunks/...
     vercel, AWS Lambda,
     a Node container                     → deploy to:
                                             any file host
                                             (github pages, s3, netlify,
                                              even a USB stick)
```

The practical consequence: if any code in the codebase reaches for `getServerSideProps`, an API route, or server-side dynamic rendering, the build fails. Next.js refuses to export routes that need a runtime.

**The `basePath` + `assetPrefix` toggle**

GitHub Pages serves project sites at `https://<user>.github.io/<repo>/`, not at the domain root. That `/<repo>/` prefix has to be baked into every internal link and every asset URL — otherwise links go to `https://<user>.github.io/sorting/...` and 404.

If you're coming from frontend, you've probably set `<base href="/some/path/">` in an HTML file before. `basePath` is Next.js's structured version: tell the framework once, and it prepends the prefix to every `next/link`, every `next/image`, every static asset URL it generates.

```
NODE_ENV check                  basePath value           emitted link
──────────────                  ──────────────           ──────────────────
local dev (npm run dev)    ──▶  ""                  ──▶  /sorting/bubble-sort
production build           ──▶  "/reincodes"        ──▶  /reincodes/sorting/bubble-sort
```

The toggle matters because dev and prod use the same source code but different URL roots. Hardcoding `/reincodes` would break local dev; omitting it would break production.

`assetPrefix` mirrors `basePath` because the JS chunk URLs also need the prefix — `_next/static/chunks/...` becomes `/reincodes/_next/static/chunks/...` in production.

**The `images.unoptimized: true` line**

Next.js's default `<Image>` component rewrites image URLs through an optimization proxy. That proxy is a server. With static export, the server doesn't exist, so the proxy can't run. `unoptimized: true` tells `<Image>` to emit `<img src="...">` directly, no rewriting.

```
default <Image src="/hero.png">     unoptimized: true
──────────────────────────────      ──────────────────────────────
<img src="/_next/image?            <img src="/hero.png">
       url=/hero.png&w=640">

needs the image-optimization        plain static asset, served as-is
server route                        from out/
```

The practical consequence: image dimensions, lazy-loading, and `srcset` still work because they're client-side features. What's gone is the server-side resize and format-conversion pass — every image is shipped at whatever resolution it was committed at.

**The CI pipeline that turns `out/` into a live site**

The GitHub Actions workflow is short enough to hold in your head: install deps, run `next build`, drop a `.nojekyll` file in `out/`, upload `out/` as a Pages artifact, deploy.

```
push to main
      │
      ▼
┌─────────────────────────────────────────────┐
│ GitHub Actions runner                       │
│                                             │
│   npm ci          ─── install               │
│   npm run build   ─── next build → out/     │
│   touch out/.nojekyll                       │
│   upload-pages-artifact path: out           │
│                                             │
└─────────────────────────────────────────────┘
      │
      ▼ deploy-pages action
┌─────────────────────────────────────────────┐
│ GitHub Pages CDN                            │
│   serves files from out/ at                 │
│   /reincodes/*                              │
└─────────────────────────────────────────────┘
```

The `.nojekyll` file is the one foreign-looking step. GitHub Pages defaults to running Jekyll over the uploaded content, which ignores files and folders starting with underscore — and `_next/` is where every Next.js JS chunk lives. The `.nojekyll` marker disables Jekyll so `_next/` survives.

### Move 3 — The principle

The principle this exemplifies is *compute at build time, not at request time, whenever the data is known ahead of time.* Every byte a user sees from reincodes is decided at the moment the GitHub Actions runner finishes — the algorithms, the home page, the visualizer routes. No request can change them. That's the deal you make: you give up runtime flexibility in exchange for zero infrastructure and a CDN's caching characteristics. For a portfolio + DSA visualizer, the data never depends on the request, so the deal pays off.

The full picture is below.

---

## Static export architecture — diagram

```
┌─ Build time ─────────────────────────────────────────────────────────────┐
│                                                                          │
│   src/app/**/page.tsx        ┌──────────────────────────┐                │
│   src/components/**     ───▶ │ next build               │                │
│   src/utils/**               │   output: "export"       │                │
│                              │   basePath: "/reincodes" │                │
│                              │   assetPrefix: same      │                │
│                              └────────────┬─────────────┘                │
│                                           │                              │
│                                           ▼                              │
│                                ┌─────────────────────┐                   │
│                                │ out/                │                   │
│                                │   index.html        │                   │
│                                │   sorting/.../*.html│                   │
│                                │   _next/static/*.js │                   │
│                                │   .nojekyll         │                   │
│                                └─────────────────────┘                   │
└──────────────────────────────────────────│───────────────────────────────┘
                                           │ upload-pages-artifact
                                           ▼
┌─ Hosting layer ──────────────────────────────────────────────────────────┐
│                                                                          │
│   GitHub Pages CDN                                                       │
│     serves out/ at /reincodes/                                           │
│     no compute, no functions, no DB                                      │
│                                                                          │
└──────────────────────────────────────────│───────────────────────────────┘
                                           │ HTTPS GET
                                           ▼
┌─ Browser (the only runtime in production) ───────────────────────────────┐
│                                                                          │
│   1. fetch /reincodes/sorting/bubble-sort/  → static .html              │
│   2. fetch _next/static/chunks/*.js          → React + page bundle       │
│   3. React hydrates                                                      │
│   4. user interactions stay in the browser (no network round-trip)       │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## In this codebase

**File:** `next.config.ts`
**Function / class:** module default export (`nextConfig`)
**Line range:** L1–L17

```ts
const isProd = process.env.NODE_ENV === "production";
const basePath = isProd ? "/reincodes" : "";

const nextConfig: NextConfig = {
  output: "export",                              // ← the load-bearing line
  images: { unoptimized: true },                 // ← required because no image server
  basePath,                                      // ← "/reincodes" in prod, "" in dev
  assetPrefix: basePath || undefined,            // ← mirrors basePath for JS chunks
  trailingSlash: true,                           // ← /sorting/bubble-sort/index.html
  eslint: { ignoreDuringBuilds: true },
};
```

**File:** `.github/workflows/deploy.yml`
**Function / class:** `build` + `deploy` jobs
**Line range:** L17–L47

The pipeline that turns the local `next.config.ts` contract into a live site: checkout → `npm ci` → `npm run build` → `touch out/.nojekyll` → `upload-pages-artifact path: out` → `deploy-pages`.

---

## Elaborate

### Where this pattern comes from

Static site generation predates the term. Personal homepages in the 90s were exactly this — HTML files on a file server. The pattern came back into vogue in the mid-2010s under the "JAMstack" label (Jekyll, Hugo, Gatsby, then Next.js's `export` mode) as a reaction to the operational cost of WordPress and Rails monoliths for what was usually content that didn't change between requests.

### The deeper principle

The principle is *cache invalidation is easy when nothing invalidates.* Static export removes a category of problems — request-time data freshness, server scaling, runtime errors in production — by removing the runtime that produces them. What you ship is what users see, byte for byte, until the next deploy.

```
Dynamic runtime                  Static export
─────────────────                ─────────────────
build → server                   build → files
server → response (per request)  CDN → response (cached, identical)

failure modes:                   failure modes:
  - cold starts                    - stale content (until next deploy)
  - DB unreachable                 - wrong basePath
  - rate limits
  - regional outages
```

### Where this breaks down

Static export breaks when (1) the data depends on the request — per-user content, A/B tests, auth gates; (2) the dataset is too large to pre-render every route — a million-product e-commerce site cannot pre-build a million HTML files in any reasonable build time; (3) the content needs to change faster than the CI pipeline can rebuild and redeploy — a stock ticker, a live chat. Any of those, and the runtime has to come back.

### What to explore next

- Incremental Static Regeneration (ISR) → middle ground: pre-build everything, but let routes re-render on demand against a stale-while-revalidate cache
- Edge functions → the cheap-runtime alternative when you need *some* server logic without provisioning a box
- Hybrid Next.js deploys on Vercel → some routes static, some routes server-rendered, decided per-route via `export const dynamic = "force-static" | "force-dynamic"`

---

## Tradeoffs

### Comparison table — both costs in one frame

```
┌──────────────────┬───────────────────────────┬──────────────────────────────┐
│ Cost dimension   │ Static export (taken)     │ SSR Next.js on Vercel        │
├──────────────────┼───────────────────────────┼──────────────────────────────┤
│ Hosting $/mo     │ $0 (GitHub Pages)         │ $0–20 (Vercel Hobby/Pro)     │
│ Cold start       │ none (CDN files)          │ 100–400ms on idle routes     │
│ Per-request data │ impossible                │ first-class                  │
│ Auth/secrets     │ impossible (no server)    │ env vars on the server       │
│ Build time       │ ~30–60s, fully            │ ~30–60s + lambda packaging   │
│                  │ deterministic             │                              │
│ Failure blast    │ zero runtime failures     │ region outage, function      │
│                  │ possible                  │ errors, rate limits          │
│ Ops burden       │ zero — just push to main  │ none for Vercel, real for    │
│                  │                           │ self-hosted Node             │
│ Future bend      │ rigid — adding auth means │ flexible — flip a flag,      │
│                  │ re-architecting           │ add an API route             │
└──────────────────┴───────────────────────────┴──────────────────────────────┘
```

### Sub-block 1 — what we gave up

The first thing gone is *any concept of per-request data*. The visualizers can't read URL params at render time, can't gate routes by an auth cookie, can't show a different home page to a returning visitor. The bubble-sort page that lands in a user's browser is byte-identical to the one in every other user's browser — and to the one in `out/sorting/bubble-sort/index.html` on the CI runner.

The second thing gone is *any server-only secret*. There is no place to put an API key, because there's nowhere for it to live except the JS bundle the browser downloads — which would mean publishing it. So integrations that require a secret (a private analytics API, a paid LLM endpoint, a server-side database) are simply off the table. The codebase enforces this by not having them; if a feature needed one, it couldn't ship without breaking the static-export contract.

The third thing gone is *adaptive caching*. With a server, you can vary cache headers per route or per user. Here, every file gets whatever cache headers GitHub Pages decides to apply. If you wanted aggressive cache busting on one route and long-lived caching on another, you're out of luck — file hosts treat all files the same.

### Sub-block 2 — what the alternative would have cost

If this had been deployed as a normal Next.js app on Vercel, the dev experience would barely change — the same code, the same App Router. But the deploy surface area widens significantly. Vercel offers a free tier, but only up to bandwidth and function-invocation limits — and a popular Hacker News post would push a portfolio site over those in a day, forcing either a $20/month Pro tier or a 10-minute scramble to reconfigure.

The lambda-per-route runtime would also introduce a category of failure that doesn't exist today: a function can throw at runtime, a region can have an outage, a cold start can time out a hydration. None of those failure modes are reachable here because no code runs in production. The cost of avoiding them later would be observability — Sentry, log forwarding, an uptime monitor. Free, until you outgrow free.

The biggest invisible cost is *the next refactor*. SSR Next.js bakes in the assumption that you'll add server-only logic later. Static export bakes in the opposite assumption. Picking SSR for a static portfolio means carrying weight you might never use; picking static export for a site that later needs auth means a rebuild.

### Sub-block 3 — the breakpoint

Static export stops being the right call the moment any visualizer needs persisted state across sessions — a user-saved sorting playback, a public-shareable algorithm replay, a comments section under each algorithm. At that point you need a server runtime, which means a real hosting plan (Vercel, Cloudflare Pages with functions, a Node container on Fly.io) and at least a $5–20/month bill. Below that line, the static-export choice is the right one and pays for itself every month.

### Sub-block 4 — what wasn't actually a tradeoff

Cloudflare Pages was technically an option for static hosting too — same shape, slightly faster global CDN — but the team is one person, the repo is already on GitHub, and GitHub Pages requires zero new accounts, zero DNS work, zero migration. The CDN difference is invisible at this traffic level.

### Tone

The decision was made; the cost is *no server*, paid in full; and at this scale it would be made again. Adding a server would make the site harder to operate, not easier, for the data it currently has — which is none.

---

## Tech reference (industry pairing)

### Next.js 15 `output: "export"`

- **Codebase uses:** Next.js 15.5.15 with `output: "export"` set in `next.config.ts` L7. The App Router (under `src/app/`) compiles to static HTML + JS in `out/`.
- **Why it's here:** the single flag that decides this is a build-and-ship-files app, not a build-and-ship-a-server app. Without it, GitHub Pages hosting is impossible.
- **Leading today:** Next.js App Router — adoption-leading for new React apps, 2026.
- **Why it leads:** server components by default, file-based routing, and the same code can produce static output, SSR output, or hybrid output by flipping config — so teams pick the deploy target after writing the code, not before.
- **Runner-up:** Astro 5 — innovation-leading for static-first content sites; zero-JS by default, React/Vue/Svelte components as opt-in islands. Stronger choice when JS-on-the-client is the bottleneck.

### GitHub Pages

- **Codebase uses:** `actions/configure-pages@v5` + `actions/deploy-pages@v4` in `.github/workflows/deploy.yml` L34–L47. Serves files under `/reincodes/`.
- **Why it's here:** $0 file hosting tied to the repo, with HTTPS, custom-domain support, and a CI pipeline already integrated. No new accounts.
- **Leading today:** Cloudflare Pages — innovation-leading for static + edge-functions hybrid, 2026.
- **Why it leads:** larger global PoP footprint than GitHub Pages, plus Pages Functions for "I want static but also one tiny API route" cases, plus unlimited bandwidth on the free tier.
- **Runner-up:** Netlify — adoption-leading among the "deploy a Jamstack site" crowd; first-class form handling and edge functions, slightly more polished CI/CD.

### GitHub Actions

- **Codebase uses:** single workflow at `.github/workflows/deploy.yml` runs `npm ci && npm run build` on push to `main`, then uploads `out/` and triggers the Pages deploy.
- **Why it's here:** runs the `next build` step that produces `out/`. The whole "static export" idea only works because something produces the static files; GitHub Actions is that something.
- **Leading today:** GitHub Actions — adoption-leading for repo-tied CI, 2026.
- **Why it leads:** auth and permissions are already wired to the repo, the marketplace covers most build tasks, and the YAML format is what most engineers already know.
- **Runner-up:** Cloudflare Pages build pipeline — innovation-leading where the host runs the build too, eliminating the artifact-upload step. Tighter feedback loop but more lock-in.

---

## Summary

### Part 1 — concept recap

Static export is the build mode where every route in the Next.js app is compiled to plain HTML and JS at build time, with no Node runtime in production. In this codebase, one line — `output: "export"` in `next.config.ts` — flips the deploy target from a server to a folder, and `basePath` + `assetPrefix` toggled by `NODE_ENV` adapt every internal link and asset URL for GitHub Pages' `/reincodes` path. The constraint that made it the right call is the data: a portfolio + DSA visualizer has no per-request state, so the entire site can be decided at build time. The cost is rigidity — adding auth, an API, or per-user content would require leaving static export and re-architecting the deploy.

### Part 2 — key points to remember

- This pattern lives in checklist step 1 (**Data model** — none persisted; everything is in the bundle) and step 2 (**Request / response flow** — CDN serves pre-built files; no compute on the response path).
- One config flag, `output: "export"`, decides the entire deploy target — every other line in `next.config.ts` exists to make that flag work on GitHub Pages.
- `basePath` and `assetPrefix` are toggled by `NODE_ENV` so the same code runs at `/` in dev and `/reincodes/` in prod without a separate build.
- `.nojekyll` in `out/` is what stops GitHub Pages from deleting the `_next/` folder where all the JS chunks live.
- The whole site has zero runtime failure modes — no cold starts, no DB outages, no rate limits — because no code runs in production.
- The breakpoint is the first feature that needs per-user data; below that line, static export is free, and above it, static export is impossible.

---

## Interview defense

### What an interviewer is really asking

When an interviewer asks about static export, they're not testing whether you can copy the docs. They're asking: did you choose static export deliberately, or did you reach for it because it was the cheapest option and you never checked? The answer they want is a decision — what static export gave you, what it cost, and the condition under which you'd flip the flag back.

### Likely questions

[mid] Q: What does `output: "export"` actually do in Next.js?

A: It tells Next.js to compile every route to a static HTML file plus a JS bundle, instead of producing a runtime that renders on each request. The build emits an `out/` directory you can upload to any file host. In this project, that's how the site lands on GitHub Pages — `next build` produces `out/`, the GitHub Actions workflow uploads it, and GitHub Pages serves the files. Nothing runs in production.

Diagram:
```
next build with output: "export"

src/app/**/page.tsx
       │
       ▼
┌─────────────────────────┐
│ Next.js prerenders each │
│ route to static HTML +  │
│ links the JS bundle     │
└────────────┬────────────┘
             ▼
       out/index.html
       out/sorting/bubble-sort/index.html
       out/_next/static/chunks/*.js
```

[senior] Q: Why static export over deploying the same Next.js app to Vercel?

A: The data is the answer. This site has zero per-request data — every page is the same for every visitor, every visualizer runs in the browser, there are no secrets or auth or DB calls. Vercel would also work, but it would add a runtime I don't need, a tier I'd eventually pay for under traffic, and a category of failure (cold starts, function errors) that doesn't exist here. Static export trades runtime flexibility for zero ops; for this data shape, the trade is one-sided.

Diagram:
```
What you pick is what your data needs.

  Data shape                        Right deploy
  ─────────────────────             ──────────────────
  same for everyone     ───────▶    static export, CDN
  varies per user       ───────▶    SSR or RSC + server
  changes every second  ───────▶    client fetches API
```

[arch] Q: At what point would you have to abandon static export here?

A: Three triggers. First, any feature that requires per-user data — saved playbacks, user accounts, comments — would need a server because there's nowhere for that data to live. Second, the first paid integration that requires a secret key — the key can't be in the JS bundle, so the secret needs a server proxy. Third, content that changes faster than the CI rebuild — the deploy pipeline is the only update path, so anything live-updating breaks. Below all three triggers, static export holds.

Diagram:
```
What breaks first when requirements change

┌─ Static export today ─────────────────────────────┐
│                                                   │
│  CDN ── files ── browser                         │
│                                                   │
└────────────────┬──────────────────────────────────┘
                 │ add: per-user state
                 ▼
┌─ Breaks here ─────────────────────────────────────┐
│  CDN  │ → needs an auth + storage backend         │
│       │   (server, DB)                            │
└───────┴───────────────────────────────────────────┘
                 │ add: secret integrations
                 ▼
┌─ Breaks here too ─────────────────────────────────┐
│  client → can't hold secrets → needs a proxy      │
└───────────────────────────────────────────────────┘
```

### The question candidates always dodge

Q: If you needed to add even one tiny dynamic feature — say, a contact form — would you rebuild this on Vercel?

A: For *one* form, no — I'd reach for a third-party form handler (Formspree, Cloudflare Pages Functions, a Google Form embed) before I'd give up the static-export deploy. The deploy is cheap to keep and expensive to give up; one form doesn't earn the rebuild. But the second time I needed something the static export couldn't do — say a server proxy for an API key, plus the form — I'd move. The migration isn't free: every internal link assumes the build-time basePath, the deploy target changes, and the CI workflow is rewritten. But the App Router code itself ports over unchanged, because nothing in `src/app/` is using export-specific APIs. That's deliberate. The shape of the code is the same whether the deploy target is static or SSR; only the config flag and the deploy pipeline differ.

Diagram:
```
What carries over if I flip output: "export" off

┌─ src/app/**            ─── unchanged ────────────┐
│   page.tsx, components, hooks, fetch logic       │
└──────────────────────────────────────────────────┘
┌─ next.config.ts        ─── delete one line ──────┐
│   remove output: "export"                        │
│   keep / remove basePath depending on host       │
└──────────────────────────────────────────────────┘
┌─ .github/workflows/    ─── replace ──────────────┐
│   swap deploy-pages for                          │
│   vercel deploy or similar                       │
└──────────────────────────────────────────────────┘
```

### One-line anchors

- "Static export is `next build` producing a folder instead of a server, and it's the right call when the data doesn't depend on the request."
- "Every line in `next.config.ts` after `output: 'export'` exists to make that flag work specifically on GitHub Pages."
- "I gave up per-request flexibility for zero infrastructure cost, and at this scale the trade pays off every month."
- "The breakpoint is the first feature that needs a server; below that, static export holds; above it, the whole deploy gets rebuilt."

---

## Validate your understanding

### Level 1 — Reconstruct the diagram

Close this file. On paper or a whiteboard, draw the full lifecycle from `git push` to a user hitting `/reincodes/sorting/bubble-sort/` and seeing the bars. Label every layer: developer machine, CI runner, hosting CDN, browser. Mark which layer each piece of code lives in.

Open the file and compare against the *Static export architecture — diagram* section.

- Pass: you included the build step, the artifact upload, the CDN, and the browser runtime
- Fail: you skipped the `.nojekyll` step or showed a server box between the CDN and the browser — re-read Move 2 and try again

### Level 2 — Explain it out loud

Explain static export to a colleague who asked "why didn't you just deploy this to Vercel?" No notes. Under 90 seconds.

Checkpoints — did you:
- Name the specific config flag (`output: "export"` in `next.config.ts`)?
- Say why this approach was chosen over SSR (the data has no per-request component)?
- Name the tradeoff in one sentence (runtime flexibility traded for zero ops)?

### Level 3 — Apply it to a new scenario

Without looking at the file: a user asks you to add a "save your sort playback as a shareable URL" feature where the URL encodes the array and speed. Walk through what does and doesn't work under the current static export setup.

Write 3–5 sentences, then open `next.config.ts` and `src/app/sorting/bubble-sort/page.tsx` and check whether the feature would actually need a server, or whether it could fit inside the query string and `useSearchParams()`.

### Level 4 — Defend the decision you'd change

Pick the biggest tradeoff from the tradeoffs section: *no per-request data, no secrets*. Answer in writing:

"If you were starting this project today with the same constraints, would you make the same decision? If you wanted to add Plausible analytics later, where would that fit, and would it require leaving static export?"

Reference `next.config.ts` and `.github/workflows/deploy.yml` to support your answer.

### Quick check — code reference test

Without opening any files, answer:
- What file holds the `output: "export"` line?
- What environment variable decides whether `basePath` is `"/reincodes"` or `""`?
- What CI workflow file builds and publishes the site?

Then open the files and verify.
