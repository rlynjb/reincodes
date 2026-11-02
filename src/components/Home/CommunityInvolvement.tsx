export default function CommunityInvolvement() {
  return (
    <section className="mb-14" aria-labelledby="community-involvement-title">
      <h2
        id="community-involvement-title"
        className="text-[12px] font-medium text-neutral-500 uppercase tracking-wider mb-6 pt-2 border-t border-neutral-800"
      >
        community involvement
      </h2>
      <div className="rounded-xl border border-neutral-800 bg-black p-4">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h3 className="text-sm font-medium">Agentic AI Foundation (AAIF)</h3>
          <span className="text-[11px] text-neutral-500">2026 – present</span>
        </div>
        <p className="mt-1 text-[11px] text-neutral-500">
          Technical Working Group Participant · Linux Foundation
        </p>
        <p className="mt-3 text-xs text-neutral-300 leading-relaxed">
          Attend public technical working-group meetings to learn how agentic
          AI standards, interoperability guidance, and community proposals are
          developed.
        </p>
        <a
          href="https://aaif.io/"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-block text-xs text-neutral-400 underline underline-offset-4 hover:text-white"
        >
          About AAIF <span aria-hidden="true">↗</span>
        </a>
      </div>
    </section>
  );
}
