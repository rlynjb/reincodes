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
    name: "buffr",
    subtitle: "daily journal and vlog",
    description:
      "Built a native Android app to capture my day in one journal — prose, todos, habits, nutrition, project tags, video clips — and render a vlog from the clips at the end of it. Local-first, AI-assisted compose.",
    tech: ["react-native", "expo", "typescript", "android", "sqlite", "supabase", "anthropic", "ffmpeg", "local-first"],
    privateRepo: true,
    iconBg: "bg-[#E1F5EE]",
    iconText: "text-[#085041]",
    initials: "lp",
  },
  {
    name: "contrl",
    subtitle: "skilltree calisthenics workout",
    description:
      "Built contrl to track bodyweight progression without spreadsheets or account walls. A 5-level skill tree across push / pull / squat with an auto rep counter — MediaPipe pose landmarking running on-device through React Native Worklets.",
    tech: ["react-native", "expo", "typescript", "expo-sqlite", "mediapipe", "react-native-vision-camera", "react-native-worklets-core", "pose-detection"],
    privateRepo: true,
    iconBg: "bg-[#FAECE7]",
    iconText: "text-[#712B13]",
    initials: "ct",
  },
  {
    name: "AdvntrCue",
    subtitle: "rag travel guide",
    description:
      "Built a Next.js RAG app with pgvector, GPT-4 streaming, tool-calling, and session memory (MemoRAG) — a learning project for modern AI engineering.",
    tech: ["Next.js", "TypeScript", "RAG", "pgvector", "OpenAI", "Vercel AI SDK", "Drizzle ORM", "Netlify Functions"],
    href: "https://adventurecue.netlify.app/",
    external: true,
    iconBg: "bg-[#EEEDFE]",
    iconText: "text-[#3C3489]",
    initials: "ac",
  },
  {
    name: "dryrun",
    subtitle: "codebase-native study app",
    description:
      "Built an Android app that turns aipe-generated study guides into a four-level validation flow — reconstruct, explain, apply, defend — graded on-device by Gemini Nano with API fallback. Local-first, GitHub-synced, spaced-repetition driven.",
    tech: ["android", "kotlin", "gemini-nano", "local-first", "spaced-repetition", "on-device-ai", "github-sync"],
    href: "https://github.com/rlynjb/dryrun",
    external: true,
    iconBg: "bg-[#FBF1D6]",
    iconText: "text-[#5A4308]",
    initials: "dr",
  },
  {
    name: "aipe",
    subtitle: "ai spec templates",
    description:
      "Built to avoid re-explaining my codebase to AI agents. 14 spec templates packaged as slash commands for Claude Code and Codex — I feed in my project context once and get filled specs every session.",
    tech: ["llm", "generative-ai", "ai-writing-assistant", "prompt-engineering", "multimodal-ai", "speech-to-text", "text-summarization", "rag"],
    href: "https://rlynjb.github.io/aipe/",
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
