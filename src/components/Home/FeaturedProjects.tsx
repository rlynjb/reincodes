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
    subtitle: "multi-agent anomaly detection",
    description:
      "Built for a multi-agent AI hackathon (Loomi Connect / Bloomreach, Analytics Agents track): a three-stage Claude agent pipeline — monitor → investigate → recommend — over MCP that scans workspace metrics for anomalies and streams every hypothesis and tool call to the UI via SSE. Backed by an eval harness (precision@k / recall@k scorers and a rubric-as-judge) so agent quality is measurable, not anecdotal.",
    tech: ["next.js", "typescript", "anthropic-sdk", "mcp", "sse-streaming", "vercel"],
    href: "https://blooming-insights.vercel.app/",
    external: true,
    iconBg: "bg-[#DFF2F0]",
    iconText: "text-[#0E5757]",
    initials: "lc",
  },
  {
    name: "aptkit",
    subtitle: "provider-agnostic agent toolkit",
    description:
      "A TypeScript monorepo of composable agent packages: a runtime with bounded tool-use loops and structured-output-with-retry, model adapters (Claude, OpenAI, local Gemma), plus RAG with swappable embeddings/vector stores and episodic conversation memory. Published to npm and reused across my agent projects, with deterministic replay evals (precision@k / recall@k) for regression-testing trajectories across model and prompt changes.",
    tech: ["typescript", "agent-runtime", "rag", "llm-evals", "npm"],
    href: "https://rlynjb.github.io/aptkit/",
    external: true,
    iconBg: "bg-[#ECE8F7]",
    iconText: "text-[#3A2B71]",
    initials: "ak",
  },
  {
    name: "buffr",
    subtitle: "rag agent with real evals",
    description:
      "A self-hosted RAG agent with an interactive chat CLI: indexes notes into pgvector (HNSW) on Supabase Postgres and answers grounded questions via a local Gemma model, with persistent cross-session conversation memory and profile-based grounding. Built around eval discipline — precision@k / recall@k scorers and full per-step trajectory capture to drive data-driven fine-tuning.",
    tech: ["rag", "pgvector", "embeddings", "llm-evals", "conversation-memory"],
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
      "A routing engine that optimizes for flat routes over fast ones — a hand-rolled A* over an OpenStreetMap + elevation graph, with admissibility and edge cases proven by 130 tests.",
    tech: ["typescript", "a-star", "graph-algorithms", "pathfinding"],
    href: "https://github.com/rlynjb/flattr",
    external: true,
    iconBg: "bg-[#E5EEF7]",
    iconText: "text-[#13406F]",
    initials: "fl",
  },
];

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- hidden for now, kept for easy restore
const supporting: Project[] = [
  {
    name: "loopd / dryrun",
    subtitle: "hybrid cloud↔on-device llm, mobile",
    description:
      "Mobile apps (React Native / Android) with hybrid LLM routing — Claude primary, local Gemma / Gemini Nano fallback, adaptive latency probing. loopd: AI-captioned daily vlogging. dryrun: validates code comprehension.",
    tech: ["react-native", "claude", "on-device-llm", "fallback-routing"],
    iconBg: "bg-[#EAE2F7]",
    iconText: "text-[#4A2B71]",
    initials: "ld",
  },
  {
    name: "contrl",
    subtitle: "on-device pose detection",
    description:
      "A React Native fitness app using on-device MediaPipe pose detection to count reps in real time — worklet-based frame processing, a per-exercise rep-counter FSM, skill-tree progression, and Notion sync.",
    tech: ["react-native", "mediapipe", "computer-vision", "on-device-ml"],
    iconBg: "bg-[#E2F2EC]",
    iconText: "text-[#0E5740]",
    initials: "ct",
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

      {/* Supporting apps hidden for now
      <div className="text-[12px] font-medium text-neutral-500 uppercase tracking-wider mt-8 mb-4">
        supporting apps
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        {supporting.map((p) => (
          <ProjectCard key={p.name} project={p} />
        ))}
      </div>
      */}
    </section>
  );
}
