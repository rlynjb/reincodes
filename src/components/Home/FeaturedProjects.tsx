import Link from "next/link";
import type { ReactNode } from "react";

type Project = {
  name: string;
  subtitle: string;
  description: string;
  tech: string[];
  href?: string;
  external?: boolean;
  privateRepo?: boolean;
  iconBg: string;
  iconText: string;
  initials: string;
};

const projects: Project[] = [
  {
    name: "LoomiConnect",
    subtitle: "agent-driven anomaly detection",
    description:
      "Hackathon project: a workspace monitoring platform that scans business metrics across 10 categories — cart abandonment, churn, fraud, conversion drops — then routes triggered anomalies through a three-stage agent pipeline: monitor → investigate → recommend.",
    tech: ["agentic-ai", "anomaly-detection", "real-time", "vercel", "snapshot-cache"],
    href: "https://blooming-insights.vercel.app/",
    external: true,
    iconBg: "bg-[#DFF2F0]",
    iconText: "text-[#0E5757]",
    initials: "lc",
  },
  {
    name: "aptkit",
    subtitle: "reusable ai agent toolkit",
    description:
      "An AI capability library extracted from production apps: provider-agnostic model adapters (Anthropic, OpenAI, local Gemma), a tool registry, structured-output parsing, and a replay-based eval harness — published to npm and consumed by my other agent projects.",
    tech: ["typescript", "agentic-ai", "llm-evals", "monorepo", "npm-package"],
    href: "https://github.com/rlynjb/aptkit",
    external: true,
    iconBg: "bg-[#ECE8F7]",
    iconText: "text-[#3A2B71]",
    initials: "ak",
  },
  {
    name: "buffr",
    subtitle: "personal rag knowledge agent",
    description:
      "A local-first RAG agent that indexes your notes into pgvector (HNSW) and answers grounded questions through a Gemma model, capturing full retrieval trajectories for evaluation and fine-tuning. Cross-surface mobile client in progress.",
    tech: ["rag", "pgvector", "embeddings", "llm-evals", "trajectory-capture"],
    href: "https://github.com/rlynjb/buffr",
    external: true,
    iconBg: "bg-[#F7F0E2]",
    iconText: "text-[#6B4E0E]",
    initials: "bf",
  },
  {
    name: "flattr",
    subtitle: "grade-aware route planning",
    description:
      "A routing engine for self-powered travel that optimizes for flat routes, not fast ones — a hand-rolled A* (Dijkstra → A* → directional cost function) over an OSM + elevation graph, with admissibility and edge-case correctness proven by 130 tests.",
    tech: ["a-star", "graph-algorithms", "pathfinding", "typescript", "osm-elevation"],
    href: "https://github.com/rlynjb/flattr",
    external: true,
    iconBg: "bg-[#E5EEF7]",
    iconText: "text-[#13406F]",
    initials: "fl",
  },
];

const baseCardClass =
  "bg-black border border-neutral-800 rounded-xl p-4 transition-colors h-full flex flex-col gap-2";
const linkCardClass = `${baseCardClass} hover:border-neutral-700 cursor-pointer`;

function CardBody({ project }: { project: Project }) {
  return (
    <>
      <div className="flex gap-2.5 items-center">
        <div
          className={`w-[34px] h-[34px] rounded-md flex items-center justify-center text-[13px] font-medium ${project.iconBg} ${project.iconText}`}
        >
          {project.initials}
        </div>
        <div className="flex flex-col">
          <div className="flex items-center gap-1.5">
            <span className="font-medium text-sm">{project.name}</span>
            {project.privateRepo && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-md border border-neutral-700 text-neutral-400">
                private repo
              </span>
            )}
          </div>
          <span className="text-[11px] text-neutral-500">{project.subtitle}</span>
        </div>
      </div>
      <p className="text-xs text-neutral-300 leading-snug">{project.description}</p>
      <div className="flex flex-wrap gap-1 mt-auto pt-1">
        {project.tech.map((t) => (
          <span
            key={t}
            className="font-mono text-[11px] px-1.5 py-0.5 rounded-md bg-neutral-900 text-neutral-400"
          >
            {t}
          </span>
        ))}
      </div>
    </>
  );
}

function ProjectCard({ project }: { project: Project }): ReactNode {
  if (!project.href) {
    return (
      <div className={baseCardClass}>
        <CardBody project={project} />
      </div>
    );
  }
  if (project.external) {
    return (
      <a
        href={project.href}
        target="_blank"
        rel="noopener noreferrer"
        className={linkCardClass}
      >
        <CardBody project={project} />
      </a>
    );
  }
  return (
    <Link href={project.href} className={linkCardClass}>
      <CardBody project={project} />
    </Link>
  );
}

export default function FeaturedProjects() {
  return (
    <section className="mb-14">
      <div className="text-[12px] font-medium text-neutral-500 uppercase tracking-wider mb-6 pt-2 border-t border-neutral-800">
        featured projects
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {projects.map((p) => (
          <ProjectCard key={p.name} project={p} />
        ))}
      </div>
    </section>
  );
}
