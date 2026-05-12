# 01 — System design

The architectural patterns that hold reincodes together as a static-export Next.js SPA.

## Files (in reading order)

1. **[01-static-export-spa](./01-static-export-spa.md)** — `output: "export"` + GitHub Pages basePath; the deploy contract.
2. **[02-app-router-routing](./02-app-router-routing.md)** — file-based routing in `src/app/`; the folder is the URL.
3. **[03-client-component-islands](./03-client-component-islands.md)** — server-by-default, `"use client"` for the visualizers.
4. **[04-component-composition](./04-component-composition.md)** — composition over inheritance; container + presentational split per visualizer.
5. **[05-animation-loop-pattern](./05-animation-loop-pattern.md)** — `await delayLoop(speed)` between mutations; the algorithm IS the animation.
6. **[06-static-data-as-source](./06-static-data-as-source.md)** — projects + concept catalogue live in `.tsx` files; git is the audit log.
7. **[07-d3-imperative-with-useeffect](./07-d3-imperative-with-useeffect.md)** — d3 owns the inside of `<svg>` via `useRef`; the React escape hatch.

## The 6-step mental checklist

Every system-design conversation about this codebase fits into one of six steps. Use them as the framing when answering an interview question or explaining the system to a new contributor.

1. **Data model** — what's stored where, in what shape.
2. **Request / response flow** — what happens when a user clicks a link.
3. **Caching layers** — what's pre-computed vs computed on demand.
4. **State ownership** — what lives client-side vs server-side vs CDN.
5. **Failure handling** — what breaks first and how it's mitigated.
6. **Scale concerns** — what changes at 10× more users / content / requests.

### Pattern → checklist step

```
                                           ┌─ 1 Data ─ 2 Flow ─ 3 Cache ─ 4 State ─ 5 Fail ─ 6 Scale
01-static-export-spa                       │   ✓        ✓                  ✓                   ✓
02-app-router-routing                      │            ✓
03-client-component-islands                │            ✓                  ✓
04-component-composition                   │                               ✓
05-animation-loop-pattern                  │            ✓                  ✓        ✓
06-static-data-as-source                   │   ✓
07-d3-imperative-with-useeffect            │            ✓                  ✓        ✓
```

## Full system map

See [`00-overview.md`](../00-overview.md) for the build → CDN → browser diagram and the per-component legend.

## What's deliberately NOT covered

- No API server (no server-side patterns).
- No database (no schema, migrations, ORMs).
- No auth, no sessions, no cookies.
- No AI / LLM usage by this codebase (see `03-ai-engineering/` for planned vizzes).
- No multi-tenant / multi-user concerns.

The architecture is intentionally constrained — everything in this section is downstream of "static export to a CDN."
