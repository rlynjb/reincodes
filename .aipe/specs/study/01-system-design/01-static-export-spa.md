# Static export SPA on a CDN path

**Industry name(s):** Static site generation (SSG), pre-rendered SPA, JAMstack
**Type:** Industry standard

> The whole site is built into HTML/JS files at author time and served from GitHub Pages under a `/reincodes` URL prefix — no Node runtime ever runs in production.

**See also:** → [02-app-router-routing](./02-app-router-routing.md) · → [03-client-component-islands](./03-client-component-islands.md)

---

## Why care

You've opened a personal site and watched it load in under a second from a cold cache. No spinner, no API call, no auth handshake — the HTML showed up complete. That's not magic; it's that there was no server doing work for you. The whole thing was a folder of files sitting on a CDN, and "loading" was just a CDN download.

This is **static site generation** — the family of techniques where the build step does the work a server would normally do at request time, and what ships is a bundle of HTML/JS/CSS. It's the same pattern as a documentation site (MkDocs, Docusaurus), a marketing page (Astro, Eleventy), or a static portfolio (Hugo). The tradeoff is real: no per-request server logic means no auth, no database lookup, no anything dynamic. In exchange you get free hosting, infinite scale, and a deploy story that's "rsync to a CDN." Here's how that actually works in this codebase.

---

## How it works

Imagine a baker who only sells bread one way: every loaf is baked before the shop opens, then put on a shelf with a price tag. A customer walks in, picks up a loaf, walks out. No oven runs during opening hours. That's what `output: "export"` does to a Next.js app — every page is baked at build time and put on a CDN shelf; the browser walks in, picks up the HTML, walks out.

### The build that pre-renders every route

`next build` walks `src/app/`, finds every `page.tsx` (including dynamic ones, when applicable), and renders each one to a static `.html` file in `./out/`. **If you're coming from frontend, you're used to `next start` running a Node process that handles each request** — here there is no `next start` in production. `output: "export"` in `next.config.ts:7` short-circuits the runtime; the build's job is to produce a folder, and that folder is the entire site.

Concretely, after `npm run build` you get:

```
out/
├─ index.html                     ← Home page
├─ sorting/bubble-sort/index.html ← /sorting/bubble-sort
├─ trees/binary-search-tree/index.html
├─ _next/static/<hash>/...js      ← React bundle chunks
└─ _next/static/<hash>/...css     ← Tailwind output
```

Every page exists as a real HTML file, complete with the React-rendered markup already there. The JS bundle hydrates the page on load, but if JS fails, the user still sees the page — that's the static-export contract.

This works as long as nothing tries to run at request time. The moment you import `cookies()`, add an API route, or use `getServerSideProps`, the build fails because `output: "export"` cannot emit code that depends on a server.

### The `basePath` that makes a sub-path deploy work

The site lives at `rlynjb.github.io/reincodes/`, not at the domain root — every link, every asset URL, every image has to know about that `/reincodes` prefix. **In React you'd handle this with a `<Link>` from your router and trust it to do the right thing**; here `next/link` honors `basePath` automatically as long as `next.config.ts` is configured right:

```
// next.config.ts:3-10
const isProd = process.env.NODE_ENV === "production";
const basePath = isProd ? "/reincodes" : "";

const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  basePath,
  assetPrefix: basePath || undefined,
  trailingSlash: true,
  ...
};
```

The practical consequence: `<Link href="/sorting/bubble-sort">` becomes `/reincodes/sorting/bubble-sort/` in the production build, but stays `/sorting/bubble-sort` in dev. **This works as long as every internal link goes through `next/link` or an `<a href>` that you remember to prefix manually.** It breaks if you hardcode an absolute `/something` URL in JSX — that link will 404 in prod because the browser will look at `rlynjb.github.io/something/`.

The `trailingSlash: true` line matters too: GH Pages serves `/foo/` (a directory) as `/foo/index.html`, but not `/foo`. Without the trailing slash, every page hard-refresh would 404.

### The `images: { unoptimized: true }` escape hatch

Next's default `<Image>` component routes through a server-side optimizer at request time — resize, format conversion, lazy decode. **Think of it like a CDN's image API, but built into the framework.** With no server, there's no optimizer; `unoptimized: true` tells Next to pass the `src` straight through to a raw `<img>`. The cost: you serve whatever resolution and format you committed. For a portfolio with a handful of icons and one boat illustration, that's fine; for a photography site, it isn't.

### Move 2.5 — what doesn't have to change between dev and prod

The build artifact and the dev server render the same React tree. The differences are all configuration: `basePath` toggles via `NODE_ENV`, `output: "export"` only matters during build (it's a no-op in dev), `next dev` serves on a server but the same pages render. **The schema of the code doesn't change between phases — only the surrounding metadata does.** That's why the pattern works: a contributor can run `npm run dev` and see the site identical to what GH Pages serves, modulo the basePath.

### The principle

This is what people mean by "use the platform" in a frontend portfolio context. The platform here is "a folder on a CDN" — the cheapest, most reliable hosting that exists. Every architectural choice in this codebase is downstream of that decision: no server, so no auth, so no database, so no per-user state, so the entire app is a pure function of static data + URL. Static export isn't a framework constraint — it's a *deliberate scope limit* that earns you a deploy story that never wakes anyone up at 3am.

The full picture is below.

---

## Static export SPA — diagram

```
                  ┌─ Build time (author machine / CI) ────────────────┐
                  │                                                   │
                  │  src/app/<page>.tsx + src/components/*.tsx        │
                  │            │                                      │
                  │            ▼  next build (output: "export")       │
                  │                                                   │
                  │  ./out/                                            │
                  │   ├─ index.html                                   │
                  │   ├─ sorting/bubble-sort/index.html               │
                  │   └─ _next/static/<hash>/*.js,*.css               │
                  │                                                   │
                  │            │                                      │
                  │            ▼  publish to gh-pages branch          │
                  │                                                   │
                  └───────────────────────────────────────────────────┘
                                              │
                                              ▼  copied verbatim
                  ┌─ Production (GitHub Pages CDN) ───────────────────┐
                  │                                                   │
                  │  rlynjb.github.io/reincodes/  →  index.html       │
                  │  rlynjb.github.io/reincodes/sorting/bubble-sort/  │
                  │                       →  sorting/bubble-sort/     │
                  │                          index.html               │
                  │                                                   │
                  │  No Node process. No API. No DB.                  │
                  │                                                   │
                  └───────────────────────────────────────────────────┘
                                              │
                                              ▼  HTTPS GET
                  ┌─ Browser ─────────────────────────────────────────┐
                  │                                                   │
                  │  1. Receive pre-rendered HTML (instant FCP)       │
                  │  2. Download React bundle from _next/static/      │
                  │  3. Hydrate → page becomes interactive            │
                  │  4. Subsequent clicks → next/link does            │
                  │     client-side navigation, basePath-aware        │
                  │                                                   │
                  └───────────────────────────────────────────────────┘
```

---

## In this codebase

**File:** `next.config.ts`
**Function / class:** `nextConfig` (the default export)
**Line range:** L1–L17

The single load-bearing config. Three settings make the deploy work: `output: "export"` (build to static files), `basePath: "/reincodes"` in prod (URL prefix), `trailingSlash: true` (GH Pages serves directories with trailing slash).

**File:** `package.json`
**Function / class:** `scripts.build`
**Line range:** L7

`"build": "next build"` — produces `./out/` because `next.config.ts` says so. There's no separate `next export` command; in Next 15 the `output: "export"` config makes `build` write the static folder directly.

GitHub source: `[next.config.ts](https://github.com/rlynjb/reincodes/blob/main/next.config.ts)`.

---

## Elaborate

### Where this pattern comes from
Static site generators predate the SPA wars — Jekyll in 2008, Hugo in 2013 — and the JAMstack term (JavaScript, APIs, Markup, popularized by Netlify around 2016) made it a category. Next.js arrived from the SPA side (it started as an SSR React framework in 2016) and added static export later when teams realized many "dynamic" sites are actually mostly static. The fusion point is the modern "framework that *can* be static" — Next, Astro, SvelteKit, Remix all offer some form of build-time rendering.

### The deeper principle
The web has two failure modes: the server is down, and the server is slow. Static export eliminates both by making "the server" be "the CDN," and CDNs are designed by paranoid people. The principle generalises: *if a thing doesn't have to be dynamic, making it static is almost always a net win for reliability and cost.*

### Where this breaks down
- Per-user content (dashboards, account pages) — these need a server or a client-side fetch to a separate API.
- Search that can't be done in-browser — needs a search service.
- Anything that needs to write data back (forms, comments) — needs an API endpoint.
- Frequent content changes — every change needs a rebuild + redeploy. Fine for a portfolio updated weekly; painful for a news site.

### What to explore next
- [02-app-router-routing](./02-app-router-routing.md) — how Next.js maps `src/app/` folders to URLs that the static export then bakes.
- [03-client-component-islands](./03-client-component-islands.md) — the `"use client"` boundary that lets interactivity coexist with pre-rendered HTML.
- [06-static-data-as-source](./06-static-data-as-source.md) — how the "no database" constraint shapes how content lives in the codebase.

---

## Tradeoffs

### Comparison table — both costs in one frame

```
┌──────────────────┬──────────────────────────┬──────────────────────────┐
│ Cost dimension   │ Path taken               │ Alternative (SSR/Node)   │
│                  │ (static export → CDN)    │                          │
├──────────────────┼──────────────────────────┼──────────────────────────┤
│ Build time       │ ~15s for ~20 routes      │ 0s (no build)            │
│ Cold-start       │ 0ms (CDN edge cache)     │ 100–1000ms (Node boot)   │
│ Dollars/month    │ $0 (GH Pages free tier)  │ $5–20 (Vercel/Fly)       │
│ Per-user dyn.    │ Impossible w/o JS fetch  │ Native — server reads DB │
│ Auth             │ Client-only (JWT in JS)  │ Server sessions, cookies │
│ Form submit      │ Needs external service   │ POST handler in app      │
│ Failure blast    │ Whole site if CDN fails  │ One region if hosted     │
│ Debugging        │ Build errors are crisp   │ Runtime errors → logs    │
│ Vendor lock-in   │ Near-zero (folder)       │ Tied to host platform    │
└──────────────────┴──────────────────────────┴──────────────────────────┘
```

### What we gave up

**Any per-request server logic.** No `cookies()`, no `headers()`, no `fetch()` at render time, no API routes. Every visitor sees the same HTML; personalization has to happen client-side after hydration. For this site that's the right call (there is no per-user data), but it's a real ceiling — adding a contact form would require dropping in Formspree or similar, not writing a `POST /api/contact` handler.

**The default `<Image>` optimizer.** With `images: { unoptimized: true }` (`next.config.ts:8`), every image ships at the resolution and format it was committed at. For the four PNG illustrations in `public/` (`police.png`, `prisoner.png`, `pixil-boat.png`), that's fine — they're small. Anyone adding photographic content would need to pre-process at the source.

**Trailing-slash URL shape.** `trailingSlash: true` means `/sorting/bubble-sort/` not `/sorting/bubble-sort`. Some external tools (sloppy backlink trackers) treat these as different URLs. A real cost; a small one.

### What the alternative would have cost

If this were deployed on Vercel as a Node-runtime Next app, the dynamic-server features would be available but every request would pay 100–1000ms of cold-start latency on the free tier (Vercel's hobby tier hibernates inactive functions). At a single visitor's read budget for a portfolio site, that latency would be *the* perceived performance characteristic — every page click would feel laggy until the server warmed up.

There'd also be a recurring cost. Free tiers exist, but they have usage caps and the moment you hit them the site goes from "free" to "$20/mo" with no warning. A folder on GH Pages will never bill you.

And the deploy story changes shape. Instead of "push to `main`, Actions copies `./out/` to `gh-pages`, done," you'd have build-then-deploy-to-Vercel, with secrets, environment-variable management, and the chance of a deploy that builds but fails at runtime because a server-only API isn't reachable. The static-export contract makes "builds" and "deploys" synonymous; the SSR path doesn't.

### The breakpoint

Fine until a feature requires per-user data the browser can't compute. The day a logged-in dashboard, a real contact form, or server-side analytics shows up, the static-export contract breaks and the site needs a runtime — either by moving to Vercel/Netlify functions or by adding a separate API service the static site calls. As a portfolio for a single user, that day is unlikely.

---

## Tech reference (industry pairing)

### Next.js (App Router) static export

- **Codebase uses:** Next.js 15.5.15 with `output: "export"` set in `next.config.ts:7`. App Router (`src/app/`), not Pages Router.
- **Why it's here:** the build pipeline that turns React components into pre-rendered HTML; the App Router gives co-located layouts and the `src/app/<route>/page.tsx` file convention.
- **Leading today:** Next.js App Router — `adoption-leading` for full-stack React, 2026. (For purely static use, it's also competitive against dedicated SSGs.)
- **Why it leads:** the only React framework that ships first-party static export, SSR, ISR, and RSC under one config; teams can start static and grow into a server without changing frameworks.
- **Runner-up:** Astro — `innovation-leading` for content-heavy static sites; ships less JS by default and treats interactivity as opt-in islands. Better choice if the site is mostly content + occasional widgets.

### GitHub Pages

- **Codebase uses:** GitHub Pages serving the `gh-pages` branch (per the recent commit `migrate from netlify to github pages with static export`). Served at `rlynjb.github.io/reincodes/`.
- **Why it's here:** the CDN host. Free, no account separate from GitHub, deploys via a workflow that copies `./out/`.
- **Leading today:** Cloudflare Pages — `adoption-leading` for static-site hosting with edge functions, 2026. GitHub Pages is the *simplest* option, but Cloudflare Pages gives you preview deploys per PR, edge functions when you need them, and the same free price.
- **Why it leads:** Cloudflare's network is the largest CDN by PoP count; Pages workflows are git-native; the upgrade path to Workers is one config change.
- **Runner-up:** Netlify — `adoption-leading` historically (this codebase used to live there); equivalent feature set, slower iteration cadence in 2024–25.

---

## Summary

### Part 1 — concept recap

Static export is the technique where the build step pre-renders every page into HTML, and the production deploy is a folder of files on a CDN — no Node runtime in production. reincodes uses it because the site has no per-user data, no forms, no auth: a portfolio with a few visualizers can live entirely client-side, and `output: "export"` in `next.config.ts` gates the build to that contract. The constraint that forces the choice is the deploy target (GitHub Pages, which can only serve static files), and the cost paid is that nothing dynamic can run server-side — every interactive feature has to fit in the browser bundle.

### Part 2 — key points to remember

- The site is a folder; deploying is copying that folder to a CDN. No Node process ever runs for an end user.
- `output: "export"` in `next.config.ts` is the gate — adding any server-only API (cookies, API routes, `getServerSideProps`) fails the build immediately.
- `basePath: "/reincodes"` is toggled by `NODE_ENV` so `next/link` produces correct URLs in prod without breaking dev.
- `trailingSlash: true` is non-negotiable on GH Pages — without it, every hard refresh on a sub-route 404s.
- Lives in step 1 (Data model) and step 2 (Request/response flow) of the system-design checklist — the data model is "static files on a CDN" and the request flow is "GET → HTML, no server."
- The cost is rigid: no per-user state, no server logic, no API; the day that changes, the architecture has to change.

---

## Interview defense

### What an interviewer is really asking

When someone asks "why did you go static for this?" they're probing two things: (1) do you understand what static export *gives up* — can you list the things you can no longer do? — and (2) did you make this choice deliberately, or did you grab the default? The honest answer in both cases is: yes, deliberately, because the site has no per-user surface. The wrong answer is "Next.js is fast." That's a tagline, not a tradeoff.

### Likely questions

**Q [mid]: How does `output: "export"` actually differ from running `next build` normally?**

A: Without `output: "export"`, `next build` produces a `.next/` directory that's meant to be served by a Node process — it includes server bundles, route manifests, and API route handlers. With `output: "export"`, it produces `./out/` which is just HTML/CSS/JS — no Node code. So the build target is different: one builds an app, the other builds a folder. The constraint is that the moment any code path requires a server (an API route, a `cookies()` call), the export build fails because there's nowhere to put that code.

```
next build              next build (output: "export")

  .next/                  out/
  ├─ server/    ──▶ Node   ├─ index.html         ──▶ CDN
  ├─ static/                ├─ sorting/.../
  ├─ standalone/            └─ _next/static/...
```

**Q [senior]: Why GH Pages over Vercel? Vercel runs Next.js natively.**

A: Two reasons. First, the site is static — there's nothing for Vercel's Node runtime to do that GH Pages can't, so the runtime is wasted. Second, GH Pages is free with no usage caps that matter at this scale, and it has zero vendor coupling — if GH Pages disappears tomorrow, the same `./out/` folder works on any other static host. Vercel offers preview deploys and analytics, which are real benefits, but neither is load-bearing for a personal site updated infrequently. The breakpoint would be needing a contact form or server-rendered analytics — at that point Vercel's runtime starts earning its keep.

```
┌── What we picked ─────────┐    ┌── What we didn't ─────────┐
│  GH Pages                 │    │  Vercel (Next.js native)  │
│  static files, $0         │    │  Node runtime, free tier  │
│  zero vendor coupling     │    │  preview-deploy-per-PR    │
│  no preview deploys       │    │  edge functions, ISR      │
│  rebuild=push to gh-pages │    │  build + deploy CI        │
└───────────────────────────┘    └───────────────────────────┘
        Wins: cost + portability       Wins: dev velocity + dynamic
```

**Q [arch]: What changes at 10× — say this becomes a public docs site with 50k visitors/day?**

A: Almost nothing on the serving side; CDNs scale to that for free. What changes is content management — at that scale you'd want a CMS-driven content pipeline (MDX or a headless CMS triggering rebuilds), incremental static regeneration so updates don't require a full rebuild, and analytics that don't require a server (something like Plausible's static-friendly snippet or Cloudflare Web Analytics). The architecture stays static; the *content workflow* moves from "edit a `.tsx` file and push" to "edit MDX in a CMS and trigger build." The piece that breaks first is the build duration — if you have 5000 pages and `next build` takes 20 minutes, deploys feel painful. ISR or partial rebuilds become load-bearing.

```
At 10× scale, here's what shifts:

┌─ CDN serving ─────────────┐
│  ✓ stays the same         │  ← no bottleneck
└───────────────────────────┘
┌─ Build pipeline ──────────┐
│  ⚠ becomes slow           │  ← breaks first
│  fix: ISR / partial build │
└───────────────────────────┘
┌─ Content workflow ────────┐
│  ✗ "edit .tsx" doesn't    │
│    scale to non-devs      │
│  fix: CMS + webhook       │
└───────────────────────────┘
```

### The question candidates always dodge

**Q: You're a frontend engineer pivoting to AI eng. Why does this portfolio even matter — wouldn't a Notion page be enough?**

A: Honestly, for the *content*, yes — a well-written Notion or README would carry the same project descriptions. The reason this site exists is the *visualizer surface* in `02-dsa/` and the planned `03-ai-engineering/` vizzes (tokenization, embeddings, agent loop). Those don't fit in a doc. They're load-bearing for two reasons: (1) building an interactive visualization is itself a demonstration of frontend depth, and (2) walking an interviewer through a working tokenization viz I built proves I understand tokenization in a way that listing it on a resume doesn't. The site is the *delivery surface* for that proof; static export is the cheapest delivery vehicle for it.

```
┌── Notion page ────────────┐    ┌── This static site ───────┐
│  text + screenshots       │    │  text + interactive viz   │
│  hosting: free            │    │  hosting: free (GH Pages) │
│  "tokenization explained" │    │  "tokenize this string"   │
│  reads like a resume      │    │  reads like a proof       │
│  build time: minutes      │    │  build time: weeks        │
│  interview signal: low    │    │  interview signal: high   │
└───────────────────────────┘    └───────────────────────────┘
```

The static-export choice is downstream of the visualizer choice: vizzes are pure-client React, so there's no reason to pay for a server.

### One-line anchors

- "It's a folder on a CDN — that's the whole deploy story."
- "`output: "export"` is the contract; the moment a feature needs a server, the build fails fast."
- "`basePath` + `trailingSlash` are the two GH-Pages-specific bits; everything else is portable."
- "Going from static to SSR is a one-config change in Next; going the other way is a rewrite."

---

## Validate your understanding

### Level 1 — Reconstruct the diagram

Close this file. Draw three boxes from left to right labelled **author machine**, **GitHub Pages CDN**, **browser**. Draw arrows showing what flows between them and label each arrow. Include the `./out/` folder, the basePath, and where hydration happens.

Open the file. Compare to the diagram above.

✓ Pass: you got the three layers in order and labelled at least one arrow with a real artifact (`./out/`, `gh-pages branch`, `_next/static/`).
✗ Fail: re-read the diagram section, wait 10 minutes, retry. Don't move on until you pass.

### Level 2 — Explain it out loud

Explain to an imaginary colleague: "How does a click on the *About* link in your portfolio actually work in production?" Under 90 seconds, no notes.

Checkpoints:
- Name the specific config setting? → `next.config.ts:7` — `output: "export"`.
- Say why this approach was chosen over SSR? → no per-user data, free hosting, zero vendor lock-in.
- Name the tradeoff in one sentence? → can't run server logic; every dynamic feature has to fit in the JS bundle.

If you skipped any of these, you described it without understanding it.

### Level 3 — Apply it to a new scenario

Without looking: "A friend asks you to add a contact form to this site. They expect form submissions to land in their email. What do you do, and why can't you just write an API route?"

Write 3–5 sentences. Then open `next.config.ts` and confirm the line you're pointing at when you say "this is what forces it."

### Level 4 — Defend the decision you'd change

Pick the biggest tradeoff. Answer in writing:
"If you were starting this project today, would you still pick GH Pages + `output: "export"`? Or would you go Vercel + SSR for the room to grow?"

Reference `next.config.ts` for what currently exists and what would have to change.

### Quick check — code reference test

Without opening files, answer:
- What file holds the static-export config?
- What's the key config option that enables it?
- Roughly what line is it on?

Then open the file to verify.

✓ Pass: `next.config.ts`, `output: "export"`, around line 7.
