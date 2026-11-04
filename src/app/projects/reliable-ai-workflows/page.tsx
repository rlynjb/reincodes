import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Reliable AI-Assisted Engineering Workflows | Reincodes",
  description:
    "An in-progress engineering case study on auditing and integrating requirements-refinement and sprint-assessment agent skills.",
};

const responsibilities = [
  {
    name: "Refine Requirements",
    purpose:
      "Clarify functional and non-functional requirements, stakeholder questions, assumptions, and design trade-offs before implementation.",
  },
  {
    name: "Sprint Assessment",
    purpose:
      "Assess whether work is ready for a sprint, including open questions, dependencies, risk, and implementation readiness.",
  },
];

const nextChecks = [
  "Incomplete story: identify missing acceptance criteria or non-functional requirements without declaring it ready.",
  "Conflicting inputs: flag contradictory requirements instead of making unsupported assumptions.",
  "Complete story: recognize answered questions and avoid redundant refinement.",
  "Integration handoff: preserve context without duplicating the responsibilities of both skills.",
];

export default function ReliableAIWorkflowsCaseStudy() {
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
          professional work / engineering case study / in progress
        </p>
        <h1 className="text-3xl sm:text-4xl font-medium tracking-tight text-white mb-3">
          Reliable AI-Assisted Engineering Workflows
        </h1>
        <p className="text-xs text-neutral-500 mb-5">
          Focus: Refine Requirements + Sprint Assessment
        </p>
        <p className="text-base sm:text-lg text-neutral-200 leading-relaxed mb-4">
          Clarifying the boundaries between AI-assisted requirements refinement
          and sprint readiness assessment.
        </p>
        <p className="text-sm leading-relaxed text-neutral-400 max-w-[620px]">
          I am auditing two agent skills used in software planning and
          contributing to their integration. The current work focuses on
          identifying overlapping responsibilities, defining a coherent
          workflow, and identifying where validation would strengthen
          confidence in the results.
        </p>
      </header>

      <section className="mb-12" aria-labelledby="context-heading">
        <h2 id="context-heading" className="text-base font-medium text-white mb-3">
          01 / the engineering problem
        </h2>
        <p className="text-sm leading-relaxed text-neutral-300">
          AI-assisted development benefits from clear requirements before
          implementation. But when multiple agent skills participate in
          planning, poorly defined boundaries can create duplicate questions,
          missed information, or readiness decisions that are difficult to
          verify. The goal is to define what each skill owns and how their
          outputs should work together.
        </p>
      </section>

      <section className="mb-12" aria-labelledby="scope-heading">
        <h2 id="scope-heading" className="text-base font-medium text-white mb-3">
          02 / skills and responsibilities
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {responsibilities.map((item) => (
            <div key={item.name} className="border border-neutral-800 rounded-lg p-4">
              <h3 className="text-sm font-medium text-neutral-100 mb-2">
                {item.name}
              </h3>
              <p className="text-xs text-neutral-400 leading-relaxed">
                {item.purpose}
              </p>
            </div>
          ))}
        </div>
        <p className="text-xs text-neutral-500 leading-relaxed mt-4">
          These are the intended responsibilities being reviewed, not a claim
          that the integrated workflow is already deployed.
        </p>
      </section>

      <section className="mb-12" aria-labelledby="contributions-heading">
        <h2 id="contributions-heading" className="text-base font-medium text-white mb-3">
          03 / what I am working on
        </h2>
        <ul className="list-disc pl-4 space-y-3 text-sm leading-relaxed text-neutral-300">
          <li>
            Auditing skill instructions and outputs to identify areas of
            overlap and missing validation.
          </li>
          <li>
            Contributing to an integration approach that separates
            requirements discovery from sprint readiness decisions.
          </li>
          <li>
            Clarifying potential handoffs, open questions, and quality
            criteria before committing to implementation.
          </li>
        </ul>
      </section>

      <section className="mb-12" aria-labelledby="eval-heading">
        <h2 id="eval-heading" className="text-base font-medium text-white mb-3">
          04 / evaluation direction
        </h2>
        <p className="text-sm leading-relaxed text-neutral-300 mb-4">
          The next proposed step is to introduce repeatable evaluations that
          check skill behavior, not just whether the instructions are
          well-written. Initial test scenarios could include:
        </p>
        <ul className="list-disc pl-4 space-y-3 text-xs text-neutral-400 leading-relaxed">
          {nextChecks.map((check) => (
            <li key={check}>{check}</li>
          ))}
        </ul>
        <p className="text-xs text-neutral-500 leading-relaxed mt-4">
          Evaluation implementation and measured results are future work;
          this case study does not claim that these checks are running today.
        </p>
      </section>

      <section className="mb-12" aria-labelledby="status-heading">
        <h2 id="status-heading" className="text-base font-medium text-white mb-3">
          05 / current status
        </h2>
        <dl className="divide-y divide-neutral-800 border-y border-neutral-800 text-sm">
          <div className="py-3">
            <dt className="font-medium text-neutral-100 mb-1">In progress</dt>
            <dd className="text-xs leading-relaxed text-neutral-400">
              Skill audit, responsibility mapping, and requirements-to-assessment
              integration work.
            </dd>
          </div>
          <div className="py-3">
            <dt className="font-medium text-neutral-100 mb-1">Planned</dt>
            <dd className="text-xs leading-relaxed text-neutral-400">
              A small evaluation pilot with defined assertions, repeatable
              cases, and regression comparisons.
            </dd>
          </div>
        </dl>
        <p className="text-xs text-neutral-500 leading-relaxed mt-5">
          This is a generalized account of professional work. Internal
          implementation details, company data, and proprietary artifacts
          are intentionally omitted.
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
