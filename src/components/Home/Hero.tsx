type PortfolioSection = {
  id: string;
  label: string;
  description: string;
  accent: string;
  titleColor: string;
  tint: string;
  hoverTint: string;
};

const sections: PortfolioSection[] = [
  {
    id: "featured-projects",
    label: "featured projects",
    description: "Projects where I put my applied AI learning into practice.",
    accent: "bg-[#C76A8A]",
    titleColor: "text-[#C76A8A]",
    tint: "bg-[rgba(199,106,138,0.09)]",
    hoverTint: "hover:bg-[rgba(199,106,138,0.23)]",
  },
  {
    id: "engineering-foundations",
    label: "learning",
    description: "How Interview Kickstart, technical books, and MCPA study are strengthening my foundations.",
    accent: "bg-[#A193EB]",
    titleColor: "text-[#A193EB]",
    tint: "bg-[rgba(161,147,235,0.09)]",
    hoverTint: "hover:bg-[rgba(161,147,235,0.23)]",
  },
  {
    id: "community-involvement",
    label: "community",
    description: "AgentCon + MCPCon 2026 inspired me to join AI working groups and deepen my MCP learning.",
    accent: "bg-[#59C8A4]",
    titleColor: "text-[#59C8A4]",
    tint: "bg-[rgba(89,200,164,0.08)]",
    hoverTint: "hover:bg-[rgba(89,200,164,0.20)]",
  },
  {
    id: "interactive-visualizers",
    label: "visualizers",
    description: "Visualizing DSA concepts I studied at Interview Kickstart and continue exploring through books.",
    accent: "bg-[#69B8DB]",
    titleColor: "text-[#69B8DB]",
    tint: "bg-[rgba(105,184,219,0.08)]",
    hoverTint: "hover:bg-[rgba(105,184,219,0.21)]",
  },
  {
    id: "from-scratch-implementations",
    label: "implementations",
    description: "Building algorithms and data structures from scratch to reinforce what I've learned through coursework and reading.",
    accent: "bg-[#A1A1AA]",
    titleColor: "text-[#A1A1AA]",
    tint: "bg-[rgba(161,161,170,0.07)]",
    hoverTint: "hover:bg-[rgba(161,161,170,0.18)]",
  },
];

export default function Hero() {
  return (
    <section className="mb-14">
      <h1 className="text-2xl font-medium mb-1.5">hi, i&apos;m rein.</h1>
      <p className="text-[15px] text-neutral-300 leading-relaxed">
        I&apos;m a software engineer with 9 yrs of experience in front-end engineering, now expanding into backend, full-stack, and applied AI development.
      </p>
      <p className="text-[15px] text-neutral-300 leading-relaxed mt-3">
        My primary focus is <strong>Applied AI Engineering</strong>, particularly designing and building reliable AI agents and systems, with an interest in orchestration, evaluations, and system design.
      </p>
      <p className="text-[15px] text-neutral-300 leading-relaxed mt-3">
        I enjoy continuous learning, whether through structured programs, attending tech conferences, or connecting with the AI community. I love maintaining a routine of studying and making small but consistent progress on both personal and work projects.
      </p>
      <p className="text-[15px] text-neutral-300 leading-relaxed mt-3">
        I also love brainstorming ideas through voice conversations with AI, exploring different approaches, thinking through design trade-offs, and turning ideas into practical systems and workflows.
      </p>
      <p className="text-[15px] text-neutral-300 leading-relaxed mt-3">
        Outside of tech, I enjoy simple things like spending time with friends, catching a movie solo, shopping, or exploring new cities and finding fun experiences to try.
      </p>
      <p className="text-[13px] text-neutral-500 mt-4 mb-8">
        Seattle, Washington · Software Engineer · Front-End Experience · Full-Stack &amp; Applied AI Focus
      </p>

      <nav aria-label="Portfolio contents">
        <h2 className="mb-3 text-[12px] font-medium uppercase tracking-wider text-neutral-500">
          inside this portfolio
        </h2>
        <ol className="flex flex-col gap-2">
          {sections.map((section, index) => (
            <li key={section.id}>
              <a
                href={`#${section.id}`}
                className={`group flex items-start gap-3 rounded-lg px-3.5 py-3.5 transition-colors duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-300 ${section.tint} ${section.hoverTint}`}
              >
                <span
                  aria-hidden="true"
                  className="w-5 shrink-0 text-[11px] leading-[19px] text-neutral-500"
                >
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2.5">
                    <span
                      aria-hidden="true"
                      className={`h-4 w-1 shrink-0 rounded-full ${section.accent}`}
                    />
                    <span className={`font-heading text-[12px] font-semibold uppercase tracking-wider leading-[19px] ${section.titleColor}`}>
                      {section.label}
                    </span>
                  </span>
                  <span className="ml-[14px] mt-1.5 block text-[12px] leading-relaxed text-neutral-300">
                    {section.description}
                  </span>
                </span>
                <span
                  aria-hidden="true"
                  className={`shrink-0 text-sm leading-[19px] text-neutral-500 transition-transform duration-200 group-hover:translate-y-0.5 ${section.titleColor}`}
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
