# Static data files as the source of truth

**Industry name(s):** Hard-coded content, in-source content, "content as code"
**Type:** Project-specific (composition of TypeScript modules + React component data)

> The list of featured projects and the catalogue of visualizer concepts live in hand-edited TypeScript files; there is no CMS, no JSON, no database — git history is the content history.

**See also:** → [01-static-export-spa](./01-static-export-spa.md) · → [04-component-composition](./04-component-composition.md)

---

## Why care

You've watched a team add a CMS to a personal site, spend a week wiring auth and webhooks and a "drafts" workflow, then ship a single sentence of new content. The infrastructure cost out-ran the content velocity by orders of magnitude. For a site updated three times a year, a `.tsx` file edited in your IDE is faster than any CMS will ever be.

This is **content-as-code**: the content of the site lives in source files committed to the repo. Same pattern as MDX blogs, Hugo's content folders, every README ever. The win is no separate system to maintain; the cost is non-technical contributors can't edit. Here's how that shape sits in this codebase.

---

## How it works

Picture a museum guide written by hand on a wall plaque. To update it, you scrape the old paint and repaint. There's no database of plaques, no admin tool — the plaque *is* the data. Slow to change at scale; easy to change at small scale; cheap to maintain because there's nothing to maintain.

### The two content sources

```
src/components/Home/
├─ FeaturedProjects.tsx   ← projects array: 4 entries, ~14 fields each
└─ conceptsData.tsx       ← CONCEPT_CATEGORIES: 4 categories, 14 concepts total
```

**If you're coming from frontend, you're used to fetching content from an API — here it's different**: the array is *in the component file itself*. The component imports nothing external; it reads the literal array and renders.

```
// src/components/Home/FeaturedProjects.tsx:16–61 (excerpt)
const projects: Project[] = [
  {
    name: "loopd",
    subtitle: "daily journal and vlog",
    description: "Built a native Android app to capture my day...",
    tech: ["react-native", "expo", "typescript", ...],
    iconBg: "bg-[#E1F5EE]",
    iconText: "text-[#085041]",
    initials: "lp",
  },
  // ... 3 more
];
```

The practical consequence: to add a new project to the home page, you edit this array in your IDE, save, commit. No admin UI, no DB migration, no "where do I add this?" — the project list *is* the file.

### Why the structure is TypeScript, not JSON

```
type Project = {
  name: string;
  subtitle: string;
  description: string;
  tech: string[];
  href?: string;
  external?: boolean;
  iconBg: string;
  iconText: string;
  initials: string;
};
```

**This is like a Zod schema for JSON, except you don't need Zod because TypeScript checks the shape at compile time.** The type means a missing field is a build error, not a runtime crash. The optional `href`/`external` model an explicit difference between "project with no link" and "project linking out."

The concept catalogue (`conceptsData.tsx`) goes further: it stores *React components* (SVG thumbnails) directly in the data:

```
// src/components/Home/conceptsData.tsx
export const CONCEPT_CATEGORIES: ConceptCategory[] = [
  {
    name: "sorting",
    concepts: [
      {
        title: "selection sort",
        href: "/sorting/selection-sort",
        meta: "o(n²)",
        thumb: <SortingThumb bars={[30,50,70,40,60,20]} highlight={2} />,
      },
      ...
    ],
  },
  ...
];
```

The boundary condition: this only works because `conceptsData.tsx` is a `.tsx` file (so JSX is legal) and lives in a server component context. **You can't write JSX into a `.json` file** — that's the cost of bringing inline SVGs into data. The benefit is that thumbnails are versioned alongside the catalogue entries; adding a new concept means adding its thumb component right next to its title.

### What this means for "deployment"

Updating content is `git push`. The CI then runs `next build` (which inlines the new array into the static HTML) and publishes the `./out/` folder. From "save file in editor" to "live on site" is ~2 minutes if the GH Actions queue is empty. There's no preview-then-publish step, no editorial workflow, no draft state — *every commit on `main` is live*.

That sounds reckless until you notice that the contributor here is the single author of the site, who can simply use a feature branch + PR if drafting is needed.

### The principle

This is what people mean by "you don't need a CMS" for small surfaces. The principle is that *the cost of a content system should scale with content velocity*. A daily newspaper needs a CMS; a portfolio updated quarterly doesn't. Premature CMS adoption is a classic time-sink — you can spend a month wiring Contentful and another month moving content into it, all to support a workflow you don't actually have.

The full picture is below.

---

## Static data as source — diagram

```
┌─ Source files (hand-edited) ─────────────────────────────────────┐
│                                                                  │
│  src/components/Home/                                            │
│  ├─ FeaturedProjects.tsx                                         │
│  │   ├─ type Project = {...}                                     │
│  │   ├─ const projects: Project[] = [ ... 4 entries ... ]         │
│  │   └─ export default FeaturedProjects()                        │
│  │                                                               │
│  └─ conceptsData.tsx                                             │
│      ├─ inline SVG thumb components                              │
│      └─ export CONCEPT_CATEGORIES: ConceptCategory[]              │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼  next build (server-renders + inlines)
                              │
┌─ Static HTML (./out/index.html) ──────────────────────────────────┐
│                                                                  │
│  The 4 project cards' markup, baked into HTML                    │
│  The 14 concept tiles' markup + inline SVG, baked into HTML      │
│  No fetch, no hydration of content — only the surrounding JS     │
│  shell (if any client island wraps it)                           │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼  served from CDN
                  rlynjb.github.io/reincodes/
```

---

## In this codebase

**Featured projects:** `src/components/Home/FeaturedProjects.tsx` L16–L61 — the `projects: Project[]` constant.
**Concept catalogue:** `src/components/Home/conceptsData.tsx` L240–L345 — `CONCEPT_CATEGORIES: ConceptCategory[]`.
**Sidebar config:** `src/const/sidebarNav.ts` — older nav config (not actively rendered on home).
**Options:** `src/const/options.ts` — `inputSizeOptions`, `speedOptions`, `defaultInputSize`, `defaultSpeed` for sort pages.

GitHub: `[FeaturedProjects.tsx](https://github.com/rlynjb/reincodes/blob/main/src/components/Home/FeaturedProjects.tsx)` and `[conceptsData.tsx](https://github.com/rlynjb/reincodes/blob/main/src/components/Home/conceptsData.tsx)`.

---

## Elaborate

### Where this pattern comes from
"Content as code" is the JAMstack ethos in shorthand — Hugo (2013), Jekyll (2008), and Eleventy (2018) all built sites from markdown + frontmatter checked into git. MDX (2018) made it possible to put React components into markdown content, which is roughly what `conceptsData.tsx` does without the markdown wrapping. Storing data inline in component files is older still — every React tutorial has done it since 2014.

### The deeper principle
*Match the system complexity to the workflow's complexity.* A solo author updating quarterly is a workflow that needs zero infrastructure. The cost of building infra you don't need is paid in maintenance, debugging, and learning curves forever after. A CMS on a portfolio is the canonical anti-pattern; it's also the canonical "I learned that lesson the hard way" story.

### Where this breaks down
- Non-technical contributors. The moment someone who can't edit a `.tsx` file needs to publish content, you need a CMS.
- Frequent updates. If you ship content 5+ times a week, the round-trip of edit → commit → CI → deploy becomes friction.
- Content that needs to be queried (filtering, search, related-items). At small scale, you can do this in the browser; at larger scale, you want a real query layer.
- Content that's shared across multiple deployments. The data lives in one repo; reusing it elsewhere means a build-time export step.

### What to explore next
- [04-component-composition](./04-component-composition.md) — how the static data flows into components.
- [01-static-export-spa](./01-static-export-spa.md) — why the data has to be available at build time.

---

## Tradeoffs

### Comparison table

```
┌──────────────────┬──────────────────────────┬──────────────────────────┐
│ Cost dimension   │ Hard-coded in source     │ Headless CMS (Contentful │
│                  │                          │ / Sanity / etc.)         │
├──────────────────┼──────────────────────────┼──────────────────────────┤
│ Edit-to-live time│ ~2 min (CI build)        │ Minutes-hours (CMS+CI)   │
│ Build setup      │ Zero                     │ API keys, webhooks, etc. │
│ Contributor pool │ Devs only                │ Anyone with CMS access   │
│ Dollars/month    │ $0                       │ $10–100+ (CMS subscription) │
│ Schema migration │ TypeScript refactor      │ CMS schema + content fix │
│ Type safety      │ Strict — compile error   │ Loose unless typed SDK   │
│ Versioning       │ Git history is the audit │ CMS history (often poor) │
│ Vendor lock-in   │ Zero                     │ High; export = painful   │
│ Onboarding       │ Open IDE, edit file      │ Learn CMS UI             │
└──────────────────┴──────────────────────────┴──────────────────────────┘
```

### What we gave up

Non-technical contribution. If a collaborator wanted to add a project, they'd need to open the repo in an editor and edit `FeaturedProjects.tsx`. For a solo portfolio that's fine; for a team site, it's a no-go.

Editorial workflows. There's no "draft" state, no "scheduled publish," no "preview." Every commit on `main` is live. If you write half a card and push, half a card is on the site. Workaround: use branches + PRs.

Querying. The project list isn't indexed — there's no "show me all React Native projects" search. To filter you'd need to walk the array client-side; at four entries that's free, at 400 it'd want a search index.

### What the alternative would have cost

A headless CMS (Contentful, Sanity, Notion API) would solve the non-technical-contributor problem and add editorial workflows, at the cost of: a monthly subscription, an API key in the build environment, a webhook to trigger rebuilds on content changes, a schema-management step (every new field is a schema edit *and* a typed-client regeneration), and the loss of git as the source of truth.

For a quarterly-updated personal portfolio, all of that is overhead with no payoff. Worse, the CMS becomes another vendor relationship — if Contentful changes pricing or APIs, you have to migrate the entire content corpus.

### The breakpoint

Fine until either (a) a non-developer needs to publish, or (b) content updates exceed weekly cadence with multiple authors, or (c) the corpus grows to the point where a query layer is needed (search, filtering, tagging). At any of those, a CMS or at least a structured content folder (MDX in `content/`) becomes worth its weight.

---

## Tech reference (industry pairing)

### TypeScript modules as content store

- **Codebase uses:** Plain `.tsx` files exporting typed arrays.
- **Why it's here:** the simplest possible content store; zero infrastructure.
- **Leading today:** TypeScript content modules — `adoption-leading` for solo / small-team static sites, 2026.
- **Why it leads:** zero dependencies, type-safe, git-versioned, free.
- **Runner-up:** MDX (markdown + JSX) — `innovation-leading` for content-heavy sites where authors want markdown ergonomics but still need component embedding. Same shape, slightly different surface.

### When you'd reach for a CMS

- **Leading today:** Sanity — `innovation-leading` for headless CMS with strong dev ergonomics, 2026. Real-time collab, custom schemas in TS.
- **Runner-up:** Contentful — `adoption-leading` for enterprise content, slower-moving.

---

## Summary

### Part 1 — concept recap

Static data as source is the technique of keeping site content in hand-edited TypeScript files committed to the repo, with git history as the content audit log. reincodes uses two such files — `FeaturedProjects.tsx` for the 4 project cards and `conceptsData.tsx` for the 14 visualizer tiles (including inline SVG thumbnails) — and the build inlines them into the static HTML. The constraint that forces the choice is "solo author updating quarterly," and the cost paid is that only developers can edit, with no editorial workflow.

### Part 2 — key points to remember

- Content lives in `.tsx` files, not JSON, so JSX (inline SVG components) is legal.
- Type definitions (`Project`, `Concept`, `ConceptCategory`) catch schema drift at compile time.
- Every commit is live — no draft state, no preview, no editorial workflow.
- Lives in step 1 (Data model) of the system-design checklist — the data model is "TypeScript constants in source files."
- The cost is rigid: non-devs can't edit, no querying, no editorial states.

---

## Interview defense

### What an interviewer is really asking

When someone asks "why didn't you use a CMS?", they want to know if you can size a workflow's needs against its cost. The honest answer is: for a quarterly-updated solo portfolio, a CMS is overhead with no return. They'd probably push you to defend it against scale; the right move is to name the breakpoint where it'd flip.

### Likely questions

**Q [mid]: How would I add a new featured project, say "swiftform"?**

A: Open `src/components/Home/FeaturedProjects.tsx`, scroll to the `projects` array, add a new object with `name`, `subtitle`, `description`, `tech`, `iconBg`, `iconText`, `initials`, optionally `href`/`external`. Save, commit, push. CI builds and publishes in ~2 minutes. The new card appears on `/`.

```
1. Edit projects[] in FeaturedProjects.tsx
2. git commit -m "add swiftform"
3. git push
        ↓
4. GH Actions runs next build
5. ./out/ deploys to gh-pages
6. Live in ~2 min
```

**Q [senior]: Inline SVG components inside the data array — that's mixing data and presentation. Why?**

A: They're paired by definition. A concept tile *is* its title + href + thumbnail; separating them means two structures that have to be kept in sync. By co-locating the thumb component in `conceptsData.tsx`, adding a new concept is one edit, and there's no way to ship a concept without a thumbnail (TypeScript will complain). The cost is that `conceptsData.tsx` is ~350 lines because every thumb is inline; the benefit is that the catalogue is *literally one file*. If thumbs became more complex (interactive, fetching data), I'd split them — but for static SVGs, co-location is the right shape.

```
┌── Co-located (picked) ────┐    ┌── Split (rejected) ───────┐
│  conceptsData.tsx          │   │  conceptsData.tsx          │
│   thumbs + data inline     │   │   data only                │
│  Add concept = 1 edit      │   │  thumbs/                  │
│  Thumb missing = compile   │   │   SortingThumb.tsx         │
│    error                   │   │   etc.                    │
│  File ~350 LOC             │   │  Add concept = 2 edits     │
│                            │   │  Missing thumb = no error  │
└────────────────────────────┘   └───────────────────────────┘
```

**Q [arch]: At 100 projects, would you keep this shape?**

A: No. At 100 projects, the maintenance tax of editing a single 800-line file exceeds the cost of a structured content folder. I'd migrate to one MDX file per project (`content/projects/*.mdx`), where each project's frontmatter holds the structured fields and the body is the description. Build-time globbing (`fs.readdirSync` + `glob`) reads them. The thumb stays inline as JSX in the MDX file. That gets the benefits of per-project files (smaller diffs, parallel edits) without adopting a CMS. CMS becomes worthwhile only at the point where (a) non-devs need to publish, or (b) the workflow needs editorial states.

```
At 100 projects, here's the move:
┌─ Single TS array ──────┐
│  ✗ ~800 LOC, hard to    │  ← breaks first
│    diff and review     │
└────────────────────────┘
┌─ One MDX per project ──┐
│  ✓ per-file diffs       │  ← target shape
│  ✓ structured + prose  │
└────────────────────────┘
┌─ Headless CMS ─────────┐
│  ⚠ only if non-devs    │  ← still overhead unless needed
│    or editorial workflow│
└────────────────────────┘
```

### The question candidates always dodge

**Q: You said "every commit is live." What happens when you push a syntax error?**

A: The build fails in CI before deploy, so the site stays on the previous good version — not as bad as I made it sound. But the failure surfaces in GH Actions, not in a draft preview, which means I get pinged after the fact. For a personal site that's a tolerable failure mode; for a team site with multiple authors merging concurrently, it's a recipe for "main is broken, deploys are stuck." The mitigation is per-PR previews (Vercel offers this; GH Pages doesn't natively). If reincodes ever needed a real editorial workflow, the move would be Vercel + branch previews, not a CMS.

```
┌── Today ──────────────────┐   ┌── If multi-author ────────┐
│  commit to main           │   │  PR → preview deploy       │
│  CI builds                │   │  Review preview            │
│  Pass → deploy            │   │  Merge → main builds       │
│  Fail → main stays good   │   │  Pre-prod safety            │
│  Author pinged after      │   │  No "blocking merge"        │
└───────────────────────────┘   └───────────────────────────┘
```

### One-line anchors

- "The content is the file; git is the history."
- "TypeScript types catch schema drift at compile time — no runtime validation needed."
- "Non-developers can't edit. That's the cost; until they need to, it's free."
- "A CMS is overhead until your workflow requires it."

---

## Validate your understanding

### Level 1 — Reconstruct the diagram

Draw the path content takes: source file → build → static HTML → CDN. Mark the type-check step.

### Level 2 — Explain it out loud

Explain: "Where does the description of the loopd project come from when a user loads the home page?" Under 90 seconds.

Checkpoints:
- Name the file? → `src/components/Home/FeaturedProjects.tsx`.
- Say when it runs? → build time, server-rendered into HTML.
- Name the tradeoff? → only devs can edit.

### Level 3 — Apply it to a new scenario

Without looking: "Someone non-technical wants to update a project description. What do you tell them?"

Write the answer. Then look at the file to confirm the structure they'd need.

### Level 4 — Defend the decision you'd change

"If you had to add 20 more projects this year and they updated weekly, would you stay with this pattern or migrate to MDX? Or to a CMS?"

### Quick check — code reference test

- Which file holds the project list?
- Which file holds the concept catalogue?
- Where do the SVG thumbnails live?

✓ Pass: `src/components/Home/FeaturedProjects.tsx`, `src/components/Home/conceptsData.tsx`, inline in `conceptsData.tsx`.
