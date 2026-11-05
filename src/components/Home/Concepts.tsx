import SectionHeading from "./SectionHeading";
import Link from "next/link";
import { CONCEPT_CATEGORIES } from "./conceptsData";

export default function Concepts() {
  return (
    <section id="interactive-visualizers" className="mb-14 scroll-mt-20">
      <SectionHeading tone="visualizers">
        concepts · interactive visualizers
      </SectionHeading>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-6">
        {CONCEPT_CATEGORIES.map((category) => (
          <div key={category.name}>
            <div className="font-heading text-[13px] font-medium text-neutral-300 mb-2 px-2">
              {category.name}
            </div>
            <div className="flex flex-col">
              {category.concepts.map((c) => (
                <Link
                  key={c.href}
                  href={c.href}
                  className="flex items-center gap-3 p-2 rounded-md hover:bg-neutral-900 transition-colors"
                >
                  <div className="w-10 h-10 shrink-0 bg-neutral-900 rounded-md border border-neutral-800 flex items-center justify-center overflow-hidden">
                    {c.thumb}
                  </div>
                  <div className="flex-1 flex items-center justify-between">
                    <span className="font-heading text-sm font-medium">{c.title}</span>
                    {c.wip ? (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-950 text-amber-400 font-medium">
                        wip
                      </span>
                    ) : (
                      <span className="text-[11px] text-neutral-500 font-mono">{c.meta}</span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
