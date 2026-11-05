type PortfolioSection = {
  id: string;
  label: string;
  description: string;
  bg: string;
  text: string;
};

const sections: PortfolioSection[] = [
  {
    id: "featured-projects",
    label: "featured projects",
    description: "Projects where I put my applied AI learning into practice.",
    bg: "bg-[#72243E]",
    text: "text-[#FBEAF0]",
  },
  {
    id: "engineering-foundations",
    label: "learning",
    description: "How Interview Kickstart, technical books, and MCPA study are strengthening my foundations.",
    bg: "bg-[#3C3489]",
    text: "text-[#EEEDFE]",
  },
  {
    id: "community-involvement",
    label: "community",
    description: "AgentCon + MCPCon 2026 inspired me to join AI working groups and deepen my MCP learning.",
    bg: "bg-[#085041]",
    text: "text-[#E1F5EE]",
  },
  {
    id: "interactive-visualizers",
    label: "visualizers",
    description: "Visualizing DSA concepts I studied at Interview Kickstart and continue exploring through books.",
    bg: "bg-[#164E63]",
    text: "text-[#E0F2FE]",
  },
  {
    id: "from-scratch-implementations",
    label: "implementations",
    description: "Building algorithms and data structures from scratch to reinforce what I've learned through coursework and reading.",
    bg: "bg-[#3A3A40]",
    text: "text-[#ECECEC]",
  },
];

export default function Hero() {
  return (
    <section className="mb-14">
      <h1 className="text-2xl font-medium mb-1.5">hi, i&apos;m rein.</h1>
      <p className="text-[15px] text-neutral-300 leading-relaxed">
        I&apos;m a software engineer. I enjoy reading, building side projects, and experimenting with ideas. Lately, I&apos;ve been particularly interested in applied AI engineering.
      </p>
      <p className="text-[15px] text-neutral-300 leading-relaxed mt-3">
        When I&apos;m not studying, I enjoy exploring cities and looking for fun experiences to try.
      </p>
      <p className="text-[13px] text-neutral-500 mt-4 mb-8">
        Seattle, Washington · Front-end building towards Applied AI Engineer
      </p>

      <nav aria-label="Portfolio contents">
        <h2 className="mb-3 text-[12px] font-medium uppercase tracking-wider text-neutral-500">
          inside this portfolio
        </h2>
        <ol className="overflow-hidden rounded-xl border border-neutral-800 divide-y divide-neutral-800">
          {sections.map((section, index) => (
            <li key={section.id}>
              <a
                href={`#${section.id}`}
                className="group flex items-start gap-3 px-3 py-3 transition-colors hover:bg-neutral-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-neutral-400 sm:items-center"
              >
                <span
                  className="w-5 shrink-0 pt-1 text-[11px] text-neutral-600 sm:pt-0"
                  aria-hidden="true"
                >
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="flex min-w-0 flex-1 flex-col items-start gap-1.5 sm:flex-row sm:items-center sm:gap-3">
                  <span
                    className={`inline-flex shrink-0 rounded-full px-2.5 py-[3px] text-[11px] font-medium ${section.bg} ${section.text}`}
                  >
                    {section.label}
                  </span>
                  <span className="text-xs leading-relaxed text-neutral-400">
                    {section.description}
                  </span>
                </span>
                <span
                  aria-hidden="true"
                  className="shrink-0 text-neutral-600 transition-colors group-hover:text-neutral-300"
                >
                  ↓
                </span>
              </a>
            </li>
          ))}
        </ol>
      </nav>
    </section>
  );
}
