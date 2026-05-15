import { IMPLEMENTATIONS } from "./conceptsData";

export default function Implementations() {
  return (
    <section className="mb-14">
      <div className="text-[11px] font-medium text-neutral-500 uppercase tracking-wider mb-6">
        implementations · from scratch
      </div>

      <div className="flex flex-col gap-1">
        {IMPLEMENTATIONS.map((impl) => (
          <a
            key={impl.href + impl.title}
            href={impl.href}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 p-2 rounded-md hover:bg-neutral-900 transition-colors group"
          >
            <div className="w-10 h-10 shrink-0 bg-neutral-950 rounded-md border border-neutral-800 flex items-center justify-center font-mono text-[11px] text-neutral-500 group-hover:text-neutral-300 transition-colors">
              {"</>"}
            </div>
            <div className="flex-1 flex items-center justify-between">
              <span className="text-sm font-mono text-neutral-300">{impl.title}</span>
              {impl.wip ? (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-950 text-amber-400 font-medium">
                  wip
                </span>
              ) : (
                <span className="text-[11px] text-neutral-600 font-mono">
                  {impl.meta}
                  <span className="ml-2 text-neutral-700 group-hover:text-neutral-400 transition-colors">↗</span>
                </span>
              )}
            </div>
          </a>
        ))}
      </div>
    </section>
  );
}
