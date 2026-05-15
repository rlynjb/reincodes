import Link from "next/link";
import type { ReactNode } from "react";
import { CONCEPT_CATEGORIES, type Concept } from "./conceptsData";

const rowClass =
  "flex items-center gap-3 p-2 rounded-md hover:bg-neutral-900 transition-colors";

function ConceptRow({ concept }: { concept: Concept }): ReactNode {
  const body = (
    <>
      <div className="w-10 h-10 shrink-0 bg-neutral-900 rounded-md border border-neutral-800 flex items-center justify-center overflow-hidden">
        {concept.thumb}
      </div>
      <div className="flex-1 flex items-center justify-between">
        <span className="text-sm font-medium">{concept.title}</span>
        {concept.wip ? (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-950 text-amber-400 font-medium">
            wip
          </span>
        ) : (
          <span className="text-[11px] text-neutral-500 font-mono">{concept.meta}</span>
        )}
      </div>
    </>
  );

  if (concept.external) {
    return (
      <a href={concept.href} target="_blank" rel="noopener noreferrer" className={rowClass}>
        {body}
      </a>
    );
  }
  return (
    <Link href={concept.href} className={rowClass}>
      {body}
    </Link>
  );
}

export default function Concepts() {
  return (
    <section className="mb-14">
      <div className="text-[11px] font-medium text-neutral-500 uppercase tracking-wider mb-6">
        concepts · interactive visualizers
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-6">
        {CONCEPT_CATEGORIES.map((category) => (
          <div key={category.name}>
            <div className="text-[13px] font-medium text-neutral-300 mb-2 px-2">
              {category.name}
            </div>
            <div className="flex flex-col">
              {category.concepts.map((c) => (
                <ConceptRow key={c.href + c.title} concept={c} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
