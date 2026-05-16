import { IMPLEMENTATIONS } from "./conceptsData";

export default function Implementations() {
  return (
    <section className="mb-14">
      <div className="text-[11px] font-medium text-neutral-500 uppercase tracking-wider mb-6">
        implementations · from scratch
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
        {IMPLEMENTATIONS.map((impl) => (
          <a
            key={impl.href + impl.title}
            href={impl.href}
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-col gap-2 p-3 rounded-md border border-neutral-800 hover:border-neutral-700 hover:bg-neutral-900 transition-colors group"
          >
            <div className="flex items-center justify-between">
              <div className="w-8 h-8 shrink-0 bg-neutral-950 rounded-md border border-neutral-800 flex items-center justify-center font-mono text-[11px] text-neutral-500 group-hover:text-neutral-300 transition-colors">
                {"</>"}
              </div>
              {impl.wip ? (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-950 text-amber-400 font-medium">
                  wip
                </span>
              ) : (
                <span className="text-neutral-700 group-hover:text-neutral-400 transition-colors text-sm">↗</span>
              )}
            </div>
            <span className="text-sm font-mono text-neutral-300">{impl.title}</span>
            {!impl.wip && (
              <span className="text-[11px] text-neutral-600 font-mono">{impl.meta}</span>
            )}
          </a>
        ))}
      </div>
    </section>
  );
}
