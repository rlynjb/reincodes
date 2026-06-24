interface SkillChip {
  label: string;
  bg: string;
  text: string;
}

const skills: SkillChip[] = [
  // AI / LLM engineering — the focus
  { label: "llm apis (claude, openai)", bg: "bg-[#72243E]", text: "text-[#FBEAF0]" },
  { label: "agent runtimes", bg: "bg-[#72243E]", text: "text-[#FBEAF0]" },
  { label: "multi-agent orchestration", bg: "bg-[#72243E]", text: "text-[#FBEAF0]" },
  { label: "mcp", bg: "bg-[#72243E]", text: "text-[#FBEAF0]" },
  { label: "rag", bg: "bg-[#72243E]", text: "text-[#FBEAF0]" },
  { label: "vector search (pgvector)", bg: "bg-[#72243E]", text: "text-[#FBEAF0]" },
  { label: "evals", bg: "bg-[#72243E]", text: "text-[#FBEAF0]" },
  { label: "prompt engineering", bg: "bg-[#72243E]", text: "text-[#FBEAF0]" },
  { label: "on-device llm (gemma)", bg: "bg-[#72243E]", text: "text-[#FBEAF0]" },
  // Languages
  { label: "typescript", bg: "bg-[#3C3489]", text: "text-[#EEEDFE]" },
  { label: "javascript", bg: "bg-[#3C3489]", text: "text-[#EEEDFE]" },
  { label: "python", bg: "bg-[#3C3489]", text: "text-[#EEEDFE]" },
  { label: "html", bg: "bg-[#3C3489]", text: "text-[#EEEDFE]" },
  { label: "css", bg: "bg-[#3C3489]", text: "text-[#EEEDFE]" },
  // Frontend
  { label: "react", bg: "bg-[#085041]", text: "text-[#E1F5EE]" },
  { label: "next.js", bg: "bg-[#085041]", text: "text-[#E1F5EE]" },
  { label: "vue", bg: "bg-[#085041]", text: "text-[#E1F5EE]" },
  { label: "nuxt", bg: "bg-[#085041]", text: "text-[#E1F5EE]" },
  { label: "accessibility", bg: "bg-[#085041]", text: "text-[#E1F5EE]" },
  // Backend & data
  { label: "node.js", bg: "bg-[#1E466E]", text: "text-[#E5EFF9]" },
  { label: "hono", bg: "bg-[#1E466E]", text: "text-[#E5EFF9]" },
  { label: "rest apis", bg: "bg-[#1E466E]", text: "text-[#E5EFF9]" },
  { label: "postgresql", bg: "bg-[#1E466E]", text: "text-[#E5EFF9]" },
  { label: "jwt & iam auth", bg: "bg-[#1E466E]", text: "text-[#E5EFF9]" },
  // Tooling & infra
  { label: "turborepo", bg: "bg-[#6B4E12]", text: "text-[#FBF0D8]" },
  { label: "vitest", bg: "bg-[#6B4E12]", text: "text-[#FBF0D8]" },
  { label: "vercel", bg: "bg-[#6B4E12]", text: "text-[#FBF0D8]" },
  { label: "npm publishing", bg: "bg-[#6B4E12]", text: "text-[#FBF0D8]" },
  // Foundations
  { label: "data structures & algorithms", bg: "bg-[#3A3A40]", text: "text-[#ECECEC]" },
  { label: "system design", bg: "bg-[#3A3A40]", text: "text-[#ECECEC]" },
  { label: "front-end architecture", bg: "bg-[#3A3A40]", text: "text-[#ECECEC]" },
];

export default function Hero() {
  return (
    <section className="mb-14">
      <h1 className="text-2xl font-medium mb-1.5">hi, i&apos;m rein.</h1>
      <p className="text-[15px] text-neutral-300 leading-relaxed max-w-[560px]">
        I&apos;m a software engineer with 7+ years building and shipping production web apps — React, Vue, Next.js, TypeScript — to enterprise customers like FedEx, Amazon, and CoreWeave, with around $700k in annual client cost savings along the way.
      </p>
      <p className="text-[15px] text-neutral-300 leading-relaxed max-w-[560px] mt-4">
        These days I&apos;m focused on applied AI engineering: building production systems on LLM APIs — a provider-agnostic agent runtime, multi-agent diagnostics over MCP, and RAG pipelines with proper eval harnesses.
      </p>
      <p className="text-[15px] text-neutral-300 leading-relaxed max-w-[560px] mt-4">
        I&apos;m after an applied AI / product engineering role — somewhere I can pair full-stack product delivery with hands-on LLM and agent work.
      </p>
      <p className="text-[13px] text-neutral-500 mb-8">
        seattle, wa · open to applied ai / product engineering roles
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-8">
        <div className="bg-neutral-900 rounded-lg px-3.5 py-3">
          <div className="text-[10px] text-neutral-400 uppercase tracking-wider">client cost savings</div>
          <div className="text-xl">$700k</div>
        </div>
        <div className="bg-neutral-900 rounded-lg px-3.5 py-3">
          <div className="text-[10px] text-neutral-400 uppercase tracking-wider">customers shipped to</div>
          <div className="text-[13px] leading-tight">
            fedex · amazon
            <br />
            coreweave
          </div>
        </div>
        <div className="bg-neutral-900 rounded-lg px-3.5 py-3">
          <div className="text-[10px] text-neutral-400 uppercase tracking-wider">years at switch</div>
          <div className="text-xl">7+</div>
        </div>
      </div>

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
