import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "AI-Assisted Ticket Sizing & Requirements Refinement | Reincodes",
  description:
    "An in-progress engineering case study on Jira ticket intake, codebase-informed requirements refinement, and team-reviewed story-point estimates.",
};

const workflow = [
  {
    number: "01",
    name: "Collect Jira tickets",
    detail:
      "Bring together candidate stories, acceptance criteria, stated scope, dependencies, and available context before estimating.",
  },
  {
    number: "02",
    name: "Check requirements and scope",
    detail:
      "Flag missing details, contradictory in-scope and out-of-scope statements, unclear dependencies, and possible scope creep.",
  },
  {
    number: "03",
    name: "Refine against the codebase",
    detail:
      "Use Refine Requirements to examine relevant modules and implementation paths, identify technical constraints, and surface focused stakeholder questions.",
  },
  {
    number: "04",
    name: "Recommend sizing for review",
    detail:
      "Use Sprint Assessment to consider complexity, unknowns, dependencies, and the team's estimation scale before proposing story points or marking a ticket not ready to size.",
  },
];

const responsibilities = [
  {
    name: "Refine Requirements",
    purpose:
      "Clarify functional and non-functional requirements, acceptance criteria, scope boundaries, and affected code paths; document evidence, assumptions, and open questions.",
  },
  {
    name: "Sprint Assessment",
    purpose:
      "Use that refined context to evaluate readiness and effort drivers, then prepare a tentative sizing rationale for engineers to review.",
  },
];

const validationCases = [
  "Incomplete ticket: flag missing acceptance criteria and withhold a confident sizing recommendation.",
  "Scope conflict: surface contradictions between in-scope and out-of-scope statements instead of resolving them by assumption.",
  "Scope creep: identify requested work that extends beyond the original ticket and request review.",
  "Codebase evidence: reference relevant modules and dependencies without inventing implementation details.",
  "Estimation consistency: compare proposed sizing rationales with a team's conventions and review outcomes, without treating story points as objective measurements.",
];

export default function TicketSizingCaseStudy() {
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
          AI-Assisted Ticket Sizing &amp; Requirements Refinement
        </h1>
        <p className="text-xs text-neutral-500 mb-5">
          Focus: Jira tickets · Refine Requirements · Sprint Assessment
        </p>
        <p className="text-base sm:text-lg text-neutral-200 leading-relaxed mb-4">
          Using clearer requirements and codebase context to support more
          informed sprint estimates.
        </p>
        <p className="text-sm leading-relaxed text-neutral-400 max-w-[620px]">
          I am contributing to an approach that gathers Jira stories, checks
          their scope and acceptance criteria, and connects requirements
          refinement with ticket sizing. The goal is to make assumptions,
          complexity, and uncertainty visible before a team assigns story
          points—not to replace engineering judgment with automated estimates.
        </p>
      </header>

      <section className="mb-12" aria-labelledby="context-heading">
        <h2 id="context-heading" className="text-base font-medium text-white mb-3">
          01 / the engineering problem
        </h2>
        <p className="text-sm leading-relaxed text-neutral-300">
          Jira tickets can contain incomplete requirements, conflicting
          in-scope and out-of-scope expectations, ambiguous acceptance criteria,
          or changes that expand the original scope. Estimating effort before
          resolving these gaps can hide technical complexity and lead to
          poorly understood sprint commitments. This work explores a structured
          way to uncover those issues earlier.
        </p>
      </section>

      <section className="mb-12" aria-labelledby="workflow-heading">
        <h2 id="workflow-heading" className="text-base font-medium text-white mb-3">
          02 / proposed ticket-to-estimate workflow
        </h2>
        <p className="text-sm leading-relaxed text-neutral-400 mb-5">
          The intended workflow moves from ticket intake to technical
          refinement, then to a reviewed sizing recommendation.
        </p>
        <ol className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {workflow.map((step) => (
            <li key={step.number} className="border border-neutral-800 rounded-lg p-4">
              <p className="text-[11px] text-neutral-500 mb-1">
                {step.number}
              </p>
              <h3 className="text-sm font-medium text-neutral-100 mb-2">
                {step.name}
              </h3>
              <p className="text-xs text-neutral-400 leading-relaxed">
                {step.detail}
              </p>
            </li>
          ))}
        </ol>
        <p className="text-xs text-neutral-500 leading-relaxed mt-4">
          This is the intended workflow, not a claim of a completed Jira
          integration or automated story-point estimation system.
        </p>
      </section>

      <section className="mb-12" aria-labelledby="skills-heading">
        <h2 id="skills-heading" className="text-base font-medium text-white mb-3">
          03 / skill responsibilities
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
          The boundary matters: requirements refinement establishes what work
          is understood; assessment uses that evidence to support a sizing and
          readiness decision.
        </p>
      </section>

      <section className="mb-12" aria-labelledby="output-heading">
        <h2 id="output-heading" className="text-base font-medium text-white mb-3">
          04 / intended output per ticket
        </h2>
        <p className="text-sm leading-relaxed text-neutral-300 mb-4">
          Each reviewed ticket should explain the reasoning behind an estimate,
          not just return a story-point number. Useful outputs would include:
        </p>
        <ul className="list-disc pl-4 space-y-2 text-xs text-neutral-400 leading-relaxed">
          <li>Confirmed scope, acceptance criteria, and unresolved conflicts.</li>
          <li>Relevant code paths, dependencies, risks, and assumptions.</li>
          <li>Questions that must be answered before sizing or implementation.</li>
          <li>A tentative story-point recommendation using the team's scale, with rationale and uncertainty—or an explicit not-ready-to-estimate result.</li>
        </ul>
        <p className="text-xs text-neutral-500 leading-relaxed mt-4">
          Story points are relative team estimates; the team retains the final
          decision. Greater estimation accuracy is a goal to evaluate, not a
          measured outcome claimed here.
        </p>
      </section>

      <section className="mb-12" aria-labelledby="eval-heading">
        <h2 id="eval-heading" className="text-base font-medium text-white mb-3">
          05 / validation direction
        </h2>
        <p className="text-sm leading-relaxed text-neutral-300 mb-4">
          I want repeatable checks that assess whether the workflow catches
          planning problems and supports consistent, explainable decisions.
          Candidate scenarios include:
        </p>
        <ul className="list-disc pl-4 space-y-3 text-xs text-neutral-400 leading-relaxed">
          {validationCases.map((check) => (
            <li key={check}>{check}</li>
          ))}
        </ul>
        <p className="text-xs text-neutral-500 leading-relaxed mt-4">
          These are proposed evaluation scenarios. A measured improvement in
          sizing reliability has not yet been established.
        </p>
      </section>

      <section className="mb-12" aria-labelledby="status-heading">
        <h2 id="status-heading" className="text-base font-medium text-white mb-3">
          06 / current status
        </h2>
        <dl className="divide-y divide-neutral-800 border-y border-neutral-800 text-sm">
          <div className="py-3">
            <dt className="font-medium text-neutral-100 mb-1">In progress</dt>
            <dd className="text-xs leading-relaxed text-neutral-400">
              Auditing the Refine Requirements and Sprint Assessment skills,
              clarifying their responsibilities and handoff, and identifying
              requirements and sizing validation needs.
            </dd>
          </div>
          <div className="py-3">
            <dt className="font-medium text-neutral-100 mb-1">Planned</dt>
            <dd className="text-xs leading-relaxed text-neutral-400">
              Ticket intake, codebase-grounded sizing recommendations,
              engineer review, and an evaluation pilot against team practices.
            </dd>
          </div>
        </dl>
        <p className="text-xs text-neutral-500 leading-relaxed mt-5">
          This is a generalized account of professional work. Internal Jira
          tickets, company data, and proprietary implementation details are
          intentionally omitted.
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
