import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Refine Requirements | Reincodes",
  description:
    "A codebase-first guided requirements interview skill from DotSkills, turning feature requests into evidence-backed functional and non-functional requirements before design.",
};

const stages = [
  {
    number: "01",
    title: "Inspect the ticket and codebase",
    detail:
      "Read the feature request, approved decisions, relevant code, tests, and comparable patterns. Distinguish observed behavior from approved product intent.",
  },
  {
    number: "02",
    title: "Present the findings overview",
    detail:
      "Show a concise evidence map, candidate functional and non-functional requirements, edge cases, design-input gaps, readiness, and unresolved stakeholder questions.",
  },
  {
    number: "03",
    title: "Explore selected requirements",
    detail:
      "Choose an FR, NFR, or open question for a guided or practice interview. Examine scenarios, constraints, trade-offs, and testable acceptance criteria.",
  },
  {
    number: "04",
    title: "Prepare a requirements handoff",
    detail:
      "Consolidate the refined brief, evidence gaps, and a READY / CONDITIONAL / BLOCKED assessment for later design and planning.",
  },
];

const outcomes = [
  {
    heading: "Source-backed requirements",
    detail:
      "Functional requirements (FRs), non-functional requirements (NFRs), and acceptance criteria linked to evidence or marked as proposed, assumed, or unknown.",
  },
  {
    heading: "Clear scope and edge cases",
    detail:
      "Documented boundaries, existing-pattern fit, important failure paths, dependencies, permissions, and constraints for a later design discussion.",
  },
  {
    heading: "Stakeholder decision queue",
    detail:
      "A concise set of unanswered questions with owners, priority, and whether each decision blocks handoff.",
  },
  {
    heading: "Engineering learning",
    detail:
      "Interview-style reasoning and checkpoints that connect requirements analysis with DSA-style edge cases and system-design trade-offs.",
  },
];

export default function RefineRequirementsCaseStudy() {
  return (
    <article className="max-w-[720px] mx-auto px-4 sm:px-6 py-6 pb-20 text-left text-neutral-300">
      <Link
        href="/"
        className="inline-block text-xs text-neutral-500 hover:text-white mb-8"
      >
        ← back to projects
      </Link>

      <header className="mb-12">
        <p className="text-[11px] font-medium text-neutral-500 uppercase tracking-wider mb-3">
          featured project / DotSkills / requirements engineering
        </p>
        <h1 className="text-3xl sm:text-4xl font-medium tracking-tight text-white mb-3">
          Refine Requirements
        </h1>
        <p className="text-xs text-neutral-500 mb-4">
          Parent project:{" "}
          <a
            href="https://github.com/rlynjb/dotskills"
            target="_blank"
            rel="noopener noreferrer"
            className="text-neutral-300 underline underline-offset-4 hover:text-white"
          >
            DotSkills ↗
          </a>
        </p>
        <p className="text-base sm:text-lg text-neutral-200 leading-relaxed mb-4">
          Clarify what needs to be built before deciding how to build it.
        </p>
        <p className="text-sm leading-relaxed text-neutral-400 max-w-[620px]">
          Refine Requirements is a codebase-first, overview-first agent skill
          for refining new and existing feature requests. It investigates
          relevant code and tests, organizes functional and non-functional
          requirements, identifies gaps, and uses guided interviews to prepare
          an evidence-backed brief for technical design.
        </p>
        <div className="flex flex-wrap gap-x-5 gap-y-2 mt-5 text-xs">
          <a
            href="https://github.com/rlynjb/dotskills/blob/main/skills/refine-requirements/SKILL.md"
            target="_blank"
            rel="noopener noreferrer"
            className="text-neutral-200 underline underline-offset-4 hover:text-white"
          >
            Skill source ↗
          </a>
          <a
            href="https://github.com/rlynjb/dotskills/blob/main/skills/refine-requirements/README.md"
            target="_blank"
            rel="noopener noreferrer"
            className="text-neutral-200 underline underline-offset-4 hover:text-white"
          >
            Read the skill guide ↗
          </a>
        </div>
      </header>

      <section className="mb-12" aria-labelledby="problem-heading">
        <h2 id="problem-heading" className="text-base font-medium text-white mb-3">
          01 / the engineering problem
        </h2>
        <p className="text-sm leading-relaxed text-neutral-300">
          Feature tickets can leave actors, scope boundaries, acceptance
          criteria, permissions, and non-functional expectations unclear.
          Jumping to implementation too early risks treating assumptions as
          decisions or overlooking behavior the codebase already supports.
          This skill creates a structured way to investigate those gaps
          before handing work into design.
        </p>
      </section>

      <section className="mb-12" aria-labelledby="workflow-heading">
        <h2 id="workflow-heading" className="text-base font-medium text-white mb-3">
          02 / how the skill works
        </h2>
        <p className="text-sm leading-relaxed text-neutral-400 mb-5">
          It begins with a complete, skimmable findings overview—not a
          one-question-at-a-time interrogation. Deeper discussion follows
          only after a requirement or gap is selected.
        </p>
        <ol className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {stages.map((stage) => (
            <li key={stage.number} className="border border-neutral-800 rounded-lg p-4">
              <p className="text-[11px] text-neutral-500 mb-1">{stage.number}</p>
              <h3 className="text-sm font-medium text-neutral-100 mb-2">
                {stage.title}
              </h3>
              <p className="text-xs text-neutral-400 leading-relaxed">
                {stage.detail}
              </p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mb-12" aria-labelledby="outputs-heading">
        <h2 id="outputs-heading" className="text-base font-medium text-white mb-3">
          03 / what the skill produces
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {outcomes.map((item) => (
            <div key={item.heading} className="border border-neutral-800 rounded-lg p-4">
              <h3 className="text-sm font-medium text-neutral-100 mb-2">
                {item.heading}
              </h3>
              <p className="text-xs text-neutral-400 leading-relaxed">
                {item.detail}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="mb-12" aria-labelledby="decisions-heading">
        <h2 id="decisions-heading" className="text-base font-medium text-white mb-3">
          04 / design decisions &amp; trade-offs
        </h2>
        <ul className="list-disc pl-4 space-y-3 text-sm leading-relaxed text-neutral-300">
          <li>
            <strong className="font-medium text-white">Codebase-first, not codebase-as-policy.</strong>{" "}
            Existing code and tests establish what is observable, not what
            stakeholders have approved as a requirement.
          </li>
          <li>
            <strong className="font-medium text-white">Overview before deep dives.</strong>{" "}
            A full first-pass findings map reduces fragmented questioning,
            while selectable interviews allow focused reasoning where it matters.
          </li>
          <li>
            <strong className="font-medium text-white">Unknowns stay visible.</strong>{" "}
            Requirements remain confirmed, proposed, assumed, or unknown;
            unverified source access is disclosed rather than invented.
          </li>
          <li>
            <strong className="font-medium text-white">Requirements before solutions.</strong>{" "}
            Architecture choices, implementation, and external stakeholder
            outreach are intentionally left to separately authorized work.
          </li>
        </ul>
      </section>

      <section className="mb-12" aria-labelledby="example-heading">
        <h2 id="example-heading" className="text-base font-medium text-white mb-3">
          05 / illustrative use case
        </h2>
        <p className="text-sm leading-relaxed text-neutral-300">
          Consider a ticket requesting notification preference changes.
          Before selecting a storage mechanism, the skill would look for
          existing preference behavior, identify candidate save/read
          requirements, and surface open questions such as how quickly a
          second device must see an update. That unanswered freshness
          expectation becomes an explicit NFR decision for stakeholders.
        </p>
        <p className="text-xs text-neutral-500 leading-relaxed mt-3">
          This is a hypothetical teaching scenario from the skill guide—not
          an inspected application or a completed production change.
        </p>
      </section>

      <section className="mb-12" aria-labelledby="relationship-heading">
        <h2 id="relationship-heading" className="text-base font-medium text-white mb-3">
          06 / relation to ticket sizing
        </h2>
        <p className="text-sm leading-relaxed text-neutral-300">
          Refine Requirements is the standalone requirements-analysis skill.
          My separate{" "}
          <Link
            href="/projects/reliable-ai-workflows"
            className="text-neutral-100 underline underline-offset-4 hover:text-white"
          >
            AI-Assisted Ticket Sizing &amp; Requirements Refinement
          </Link>{" "}
          case study explores using refined scope and codebase evidence
          as inputs for ticket readiness and team-reviewed story-point estimates.
          The skill itself does not automatically assign story points.
        </p>
      </section>

      <section className="mb-12" aria-labelledby="boundaries-heading">
        <h2 id="boundaries-heading" className="text-base font-medium text-white mb-3">
          07 / implementation and boundaries
        </h2>
        <p className="text-sm leading-relaxed text-neutral-300">
          The skill instructions, reference playbooks, and guided/practice
          modes are documented in DotSkills. Its intended deliverable is a
          requirements and design-input handoff, optionally prepared for a
          later Superpowers workflow. It is read-only by default and does not
          edit code, choose a final architecture, contact stakeholders, or
          claim approval without supporting evidence.
        </p>
        <p className="text-xs text-neutral-500 leading-relaxed mt-4">
          These are documented workflow capabilities and boundaries—not
          claims of measured improvements in delivery speed, estimation
          accuracy, or production deployment.
        </p>
      </section>

      <footer className="border-t border-neutral-800 pt-5">
        <Link href="/" className="text-xs text-neutral-400 hover:text-white">
          ← back to featured projects
        </Link>
      </footer>
    </article>
  );
}
