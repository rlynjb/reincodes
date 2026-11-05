import PortfolioIcon from "./PortfolioIcon";

type LearningItem = {
  title: string;
  icon: "graduation" | "certificate" | "book";
  context: string;
  description: string;
};

const learning: LearningItem[] = [
  {
    title: "Interview Kickstart",
    icon: "graduation",
    context: "Structured technical education",
    description:
      "Front-end engineering and applied agentic AI coursework, with a focus on data structures, algorithms, and system design.",
  },
  {
    title: "Model Context Protocol Associate (MCPA)",
    icon: "certificate",
    context: "Linux Foundation · Certification preparation in progress",
    description:
      "Studying MCP architecture, client-server interactions, security, and trust boundaries.",
  },
  {
    title: "Independent Engineering Study",
    icon: "book",
    context: "Ongoing",
    description:
      "Distributed systems, backend engineering, system design, and evaluation-driven agent development.",
  },
];

export default function EngineeringFoundations() {
  return (
    <section id="engineering-foundations" className="mb-14 scroll-mt-20" aria-labelledby="engineering-foundations-title">
      <h2
        id="engineering-foundations-title"
        className="text-[12px] font-medium text-neutral-500 uppercase tracking-wider mb-6 pt-2 border-t border-neutral-800"
      >
        engineering foundations &amp; continuous learning
      </h2>
      <div className="rounded-xl border border-neutral-800 bg-black p-4">
        <p className="text-xs text-neutral-300 leading-relaxed mb-4">
          Building toward applied AI engineering through structured study,
          hands-on development, and software engineering fundamentals.
        </p>
        <div className="divide-y divide-neutral-800">
          {learning.map((item) => (
            <div key={item.title} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
              <PortfolioIcon name={item.icon} />
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-medium">{item.title}</h3>
                <p className="mt-1 text-[11px] text-neutral-500">
                  {item.context}
                </p>
                <p className="mt-2 text-xs text-neutral-300 leading-relaxed">
                  {item.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
