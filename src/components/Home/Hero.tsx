interface SkillChip {
  label: string;
  bg: string;
  text: string;
}

const skills: SkillChip[] = [
  { label: "javascript", bg: "bg-[#3C3489]", text: "text-[#EEEDFE]" },
  { label: "typescript", bg: "bg-[#3C3489]", text: "text-[#EEEDFE]" },
  { label: "html", bg: "bg-[#3C3489]", text: "text-[#EEEDFE]" },
  { label: "css", bg: "bg-[#3C3489]", text: "text-[#EEEDFE]" },
  { label: "python", bg: "bg-[#3C3489]", text: "text-[#EEEDFE]" },
  { label: "vue.js", bg: "bg-[#085041]", text: "text-[#E1F5EE]" },
  { label: "nuxt.js", bg: "bg-[#085041]", text: "text-[#E1F5EE]" },
  { label: "react.js", bg: "bg-[#085041]", text: "text-[#E1F5EE]" },
  { label: "next.js", bg: "bg-[#085041]", text: "text-[#E1F5EE]" },
  { label: "data structures & algorithms", bg: "bg-[#72243E]", text: "text-[#FBEAF0]" },
  { label: "system design", bg: "bg-[#72243E]", text: "text-[#FBEAF0]" },
  { label: "applied agentic ai", bg: "bg-[#72243E]", text: "text-[#FBEAF0]" },
];

export default function Hero() {
  return (
    <section className="mb-14">
      <h1 className="text-2xl font-medium mb-1.5">hi, i&apos;m rein.</h1>
      <p className="text-[15px] text-neutral-300 leading-relaxed max-w-[560px]">
        I&apos;m a Software Engineer - Front-End, pivoting deliberately into AI engineering. After 7+ years shipping Vue and React apps to customers like FedEx, Amazon, Netflix, and CoreWeave — ~$700k in client cost savings along the way — I&apos;m retooling for the next decade of product work, where the interface is the LLM and the engineering challenge is everything that surrounds it.
      </p>
      <p className="text-[13px] text-neutral-500 mb-8">
        seattle, wa · open to frontend / ai engineering roles
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
            netflix · coreweave
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
