import Link from "next/link";
import { CONCEPT_CATEGORIES } from "./conceptsData";

export default function Concepts() {
  return (
    <section className="mb-14">
      <div className="text-[12px] font-medium text-neutral-500 uppercase tracking-wider mb-6 pt-2 border-t border-neutral-800">
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
                <Link
                  key={c.href}
                  href={c.href}
                  className="flex items-center gap-3 p-2 rounded-md hover:bg-neutral-900 transition-colors"
                >
                  <div className="w-10 h-10 shrink-0 bg-neutral-900 rounded-md border border-neutral-800 flex items-center justify-center overflow-hidden">
                    {c.thumb}
                  </div>
                  <div className="flex-1 flex items-center justify-between">
                    <span className="text-sm font-medium">{c.title}</span>
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
