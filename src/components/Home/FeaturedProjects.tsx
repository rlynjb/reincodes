import Link from "next/link";
import type { ReactNode } from "react";

type Project = {
  name: string;
  subtitle: string;
  description: string;
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
    subtitle: "Built with Next.js, Anthropic SDK, and MCP",
    description:
      "A hackathon project that uses three specialized AI agents to monitor e-commerce performance, diagnose issues, and recommend actionable steps.",
    href: "https://blooming-insights.vercel.app/",
    external: true,
    iconBg: "bg-[#DFF2F0]",
    iconText: "text-[#0E5757]",
    initials: "lc",
  },
  {
    name: "buffr",
    subtitle: "Built with the OpenAI Agents SDK",
    description:
      "A CLI-based multi-agent decision-support system that helps turn product data and research into actionable experiments and learning.",
    href: "https://github.com/rlynjb/buffr",
    external: true,
    iconBg: "bg-[#F7F0E2]",
    iconText: "text-[#6B4E0E]",
    initials: "bf",
  },
  {
    name: "contrl",
    subtitle: "Built with Google ML Kit, React Native, Pose Detection",
    description:
      "A calisthenics workout app using on-device pose detection to identify body landmarks and track movement during workouts, with rep counting and skill-tree progression.",
    href: "https://github.com/rlynjb/contrl",
    external: true,
    iconBg: "bg-[#E2F2EC]",
    iconText: "text-[#0E5740]",
    initials: "ct",
  },
];

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- hidden for now, kept for easy restore
const supporting: Project[] = [
  {
    name: "loopd / dryrun",
    subtitle: "hybrid cloud↔on-device llm, mobile",
    description:
      "Mobile apps (React Native / Android) with hybrid LLM routing — Claude primary, local Gemma / Gemini Nano fallback, adaptive latency probing. loopd: AI-captioned daily vlogging. dryrun: validates code comprehension.",
    iconBg: "bg-[#EAE2F7]",
    iconText: "text-[#4A2B71]",
    initials: "ld",
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
