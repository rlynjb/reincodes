import type { ReactNode } from "react";

type Tone = "projects" | "learning" | "community" | "visualizers" | "implementations";

// Use the same color families as the badges in "Inside This Portfolio."
// Small brighter accents stay visible on black without adding large colored panels.
const tones: Record<Tone, { accent: string; text: string }> = {
  projects: { accent: "bg-[#C76A8A]", text: "text-[#FBEAF0]" },
  learning: { accent: "bg-[#A193EB]", text: "text-[#EEEDFE]" },
  community: { accent: "bg-[#59C8A4]", text: "text-[#E1F5EE]" },
  visualizers: { accent: "bg-[#69B8DB]", text: "text-[#E0F2FE]" },
  implementations: { accent: "bg-[#A1A1AA]", text: "text-[#ECECEC]" },
};

export default function SectionHeading({
  tone,
  id,
  children,
}: {
  tone: Tone;
  id?: string;
  children: ReactNode;
}) {
  const style = tones[tone];

  return (
    <h2
      id={id}
      className="mb-6 flex items-center gap-2.5 border-t border-neutral-800 pt-4 text-[12px] font-semibold uppercase tracking-wider"
    >
      <span
        aria-hidden="true"
        className={`h-3.5 w-1 shrink-0 rounded-full ${style.accent}`}
      />
      <span className={style.text}>{children}</span>
    </h2>
  );
}
