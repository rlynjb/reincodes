import Link from "next/link";
import type { ReactNode } from "react";

type Project = {
  name: string;
  subtitle: string;
  description: string;
  tech: string[];
  href?: string;
  external?: boolean;
  iconBg: string;
  iconText: string;
  initials: string;
};

const projects: Project[] = [
  {
    name: "loopd",
    subtitle: "daily journal and vlog",
    description:
      "Built a native Android app to capture my day in one journal — prose, todos, habits, nutrition, project tags, video clips — and render a vlog from the clips at the end of it. Local-first, AI-assisted compose.",
    tech: ["react native", "expo", "typescript", "sqlite", "ffmpeg", "notion api", "claude api"],
    iconBg: "bg-[#E1F5EE]",
    iconText: "text-[#085041]",
    initials: "lp",
  },
  {
    name: "contrl",
    subtitle: "skilltree calisthenics workout",
    description:
      "Built contrl to track bodyweight progression without spreadsheets or account walls. A 5-level skill tree across push / pull / squat with an auto rep counter — MediaPipe pose landmarking running on-device through React Native Worklets.",
    tech: ["next.js", "mediapipe", "on-device ml"],
    iconBg: "bg-[#FAECE7]",
    iconText: "text-[#712B13]",
    initials: "ct",
  },
  {
    name: "AdvntrCue",
    subtitle: "rag travel guide",
    description:
      "end-to-end rag pipeline over neon postgres with pgvector. embed query → vector search → gpt answer.",
    tech: ["pgvector", "drizzle", "openai"],
    href: "https://adventurecue.netlify.app/",
    external: true,
    iconBg: "bg-[#EEEDFE]",
    iconText: "text-[#3C3489]",
    initials: "ac",
  },
  {
    name: "aipe",
    subtitle: "ai spec templates",
    description:
      "Built to avoid re-explaining my codebase to AI agents. 14 spec templates packaged as slash commands for Claude Code and Codex — I feed in my project context once and get filled specs every session.",
    tech: ["claude code", "codex", "slash commands"],
    href: "https://github.com/rlynjb/aipe",
    external: true,
    iconBg: "bg-[#FBEAF0]",
    iconText: "text-[#72243E]",
    initials: "ai",
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
          <span className="font-medium text-sm">{project.name}</span>
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
      <div className="text-[11px] font-medium text-neutral-500 uppercase tracking-wider mb-6">
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
