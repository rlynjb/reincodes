interface SkillChip {
  label: string;
  bg: string;
  text: string;
}

const skills: SkillChip[] = [
  // AI Engineering (Personal Projects)
  { label: "OpenAI Agents SDK", bg: "bg-[#72243E]", text: "text-[#FBEAF0]" },
  { label: "Anthropic SDK", bg: "bg-[#72243E]", text: "text-[#FBEAF0]" },
  { label: "Multi-Agent Workflows", bg: "bg-[#72243E]", text: "text-[#FBEAF0]" },
  { label: "MCP", bg: "bg-[#72243E]", text: "text-[#FBEAF0]" },
  { label: "LLM evaluation", bg: "bg-[#72243E]", text: "text-[#FBEAF0]" },

  // Languages
  { label: "TypeScript", bg: "bg-[#3C3489]", text: "text-[#EEEDFE]" },
  { label: "Python (dabbled)", bg: "bg-[#3C3489]", text: "text-[#EEEDFE]" },
  { label: "HTML/CSS", bg: "bg-[#3C3489]", text: "text-[#EEEDFE]" },

  // Frontend
  { label: "React", bg: "bg-[#085041]", text: "text-[#E1F5EE]" },
  { label: "Next.js", bg: "bg-[#085041]", text: "text-[#E1F5EE]" },
  { label: "Vue", bg: "bg-[#085041]", text: "text-[#E1F5EE]" },
  { label: "Nuxt", bg: "bg-[#085041]", text: "text-[#E1F5EE]" },

  // Backend
  { label: "Node.js", bg: "bg-[#164E63]", text: "text-[#E0F2FE]" },
  { label: "Go (working familiarity)", bg: "bg-[#164E63]", text: "text-[#E0F2FE]" },
  { label: "PostgreSQL / pgvector", bg: "bg-[#164E63]", text: "text-[#E0F2FE]" },

  // Tooling & Cloud
  { label: "Git", bg: "bg-[#3A3A40]", text: "text-[#ECECEC]" },
  { label: "Jenkins", bg: "bg-[#3A3A40]", text: "text-[#ECECEC]" },
  { label: "Rancher", bg: "bg-[#3A3A40]", text: "text-[#ECECEC]" },
  { label: "Fly.io (personal projects)", bg: "bg-[#3A3A40]", text: "text-[#ECECEC]" },
  { label: "Netlify (serverless)", bg: "bg-[#3A3A40]", text: "text-[#ECECEC]" },
  { label: "Vercel (basic familiarity)", bg: "bg-[#3A3A40]", text: "text-[#ECECEC]" },
];

export default function Hero() {
  return (
    <section className="mb-14">
      <h1 className="text-2xl font-medium mb-1.5">hi, i&apos;m rein.</h1>
      <p className="text-[15px] text-neutral-300 leading-relaxed">
        I&apos;m a software engineer. I enjoy reading, building side projects, and experimenting with ideas. Lately, I&apos;ve been particularly interested in AI engineering.
      </p>
      <p className="text-[15px] text-neutral-300 leading-relaxed mt-3">
        When I&apos;m not studying, I enjoy exploring cities and looking for fun experiences to try.
      </p>
      <p className="text-[13px] text-neutral-500 mt-4 mb-8">
        Seattle, Washington · Front-end engineer building toward AI engineering / full stack
      </p>

      <div className="flex flex-wrap gap-1.5">
        {skills.map((s) => (
          <span
            key={s.label}
            className={`inline-flex px-2.5 py-[3px] rounded-full text-[11px] font-medium ${s.bg} ${s.text}`}
          >
            {s.label}
          </span>
        ))}
      </div>
    </section>
  );
}
