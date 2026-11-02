import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Evaluate Skill | Reincodes",
  description:
    "A case study in designing human-gated, evidence-based evaluation workflows for AI agent skills, including their safety and execution boundaries.",
};

const phases = [
  {
    stages: "0–2",
    name: "Prepare",
    detail: "Validate the skill, define observable success, and approve test cases.",
  },
  {
    stages: "3–4",
    name: "Evaluate",
    detail: "Run a baseline only when approved isolation is verified; inspect the evidence.",
  },
  {
    stages: "5–8",
    name: "Improve",
    detail: "Diagnose failures, consider trade-offs, and apply only approved changes.",
  },
  {
    stages: "9–11",
    name: "Verify",
    detail: "Rerun comparable cases, check regressions, and make a human decision.",
  },
];

const decisions = [
  {
    title: "Reuse provider-native evaluation tools",
    reason:
      "Claude Code and Codex keep their own execution and grading paths. A thin coordinator avoids creating another general-purpose agent runtime, at the cost of provider-specific integration work.",
  },
  {
    title: "Prefer verified native isolation",
    reason:
      "A Docker-backed route is considered only when native controls cannot meet a test's requirements. Neither a copied workspace nor a container label proves isolation.",
  },
  {
    title: "Separate quality from safety",
    reason:
      "LLM rubrics can assess response quality, but independent host evidence must establish what the agent actually accessed or changed. A high score cannot override an unsafe run.",
  },
  {
    title: "Keep people at consequential checkpoints",
    reason:
      "Case preparation, execution, edits, and release decisions need explicit approval. This adds friction deliberately to prevent unreviewed side effects.",
  },
];

export default function EvaluateSkillCaseStudy() {
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
          featured project / engineering case study
        </p>
        <h1 className="text-3xl sm:text-4xl font-medium tracking-tight text-white mb-3">
          Evaluate Skill
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
          Designing repeatable, human-gated evaluations for AI agent skills.
        </p>
        <p className="text-sm leading-relaxed text-neutral-400 max-w-[620px]">
          Evaluate Skill is a guided workflow developed within DotSkills,
          the broader open-source library of reusable agent skills.
          This case study focuses specifically on Evaluate Skill&apos;s
          methodology, execution architecture, trust boundaries, and
          evidence-based improvement process.
        </p>
        <div className="flex flex-wrap gap-x-5 gap-y-2 mt-5 text-xs">
          <a
            href="https://github.com/rlynjb/dotskills"
            target="_blank"
            rel="noopener noreferrer"
            className="text-neutral-200 underline underline-offset-4 hover:text-white"
          >
            parent repository · DotSkills ↗
          </a>
          <a
            href="https://github.com/rlynjb/dotskills/blob/main/skills/evaluate-skill/README.md"
            target="_blank"
            rel="noopener noreferrer"
            className="text-neutral-200 underline underline-offset-4 hover:text-white"
          >
            Evaluate Skill documentation ↗
          </a>
        </div>
      </header>

      <section className="mb-12" aria-labelledby="problem-heading">
        <h2 id="problem-heading" className="text-base font-medium text-white mb-3">
          01 / the problem
        </h2>
        <p className="text-sm leading-relaxed text-neutral-300">
          A well-formatted agent skill is not necessarily reliable. It can miss
          important context, produce the wrong answer, or attempt an action
          outside the user&apos;s intent. Reviewing only the final output can
          miss those failure modes. I wanted a repeatable way to define success,
          test behavior, and inspect evidence before changing or releasing a skill.
        </p>
      </section>

      <section className="mb-12" aria-labelledby="use-case-heading">
        <h2 id="use-case-heading" className="text-base font-medium text-white mb-3">
          02 / use case: evaluating Learn Repo
        </h2>
        <p className="text-sm leading-relaxed text-neutral-300 mb-5">
          Given a small synthetic repository, can Learn Repo accurately describe
          the codebase, support claims with file evidence, and pause at a guided
          checkpoint? Evaluate Skill turns these expectations into approved cases
          and assertions. A prepared test is not counted as a completed model run.
        </p>
        <ol className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {phases.map((phase) => (
            <li key={phase.stages} className="border border-neutral-800 rounded-lg p-4">
              <p className="text-[11px] text-neutral-500 mb-1">
                stages {phase.stages}
              </p>
              <h3 className="text-sm font-medium text-neutral-100 mb-1">
                {phase.name}
              </h3>
              <p className="text-xs text-neutral-400 leading-relaxed">
                {phase.detail}
              </p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mb-12" aria-labelledby="architecture-heading">
        <h2 id="architecture-heading" className="text-base font-medium text-white mb-2">
          03 / system architecture
        </h2>
        <p className="text-xs leading-relaxed text-neutral-500 mb-5">
          v0.2 target design — the offline foundation exists; live execution
          and independent isolation remain unverified.
        </p>
        <ol aria-label="Proposed evaluation architecture" className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <li className="border border-neutral-800 rounded-lg p-4 min-w-0">
            <p className="text-[11px] text-neutral-500 mb-2">01 / trusted control</p>
            <h3 className="text-sm font-medium text-white mb-2">Plan &amp; approve</h3>
            <p className="text-xs text-neutral-400 leading-relaxed">
              The 12-stage skill workflow, scoped human approvals, pinned
              run plans, and capability policy.
            </p>
          </li>
          <li className="border border-neutral-800 rounded-lg p-4 min-w-0">
            <p className="text-[11px] text-neutral-500 mb-2">02 / restricted execution</p>
            <h3 className="text-sm font-medium text-white mb-2">Run in bounds</h3>
            <p className="text-xs text-neutral-400 leading-relaxed">
              One Claude or Codex route, an independently verified native
              sandbox or approved Docker fallback, and controlled mock tools.
            </p>
          </li>
          <li className="border border-neutral-800 rounded-lg p-4 min-w-0">
            <p className="text-[11px] text-neutral-500 mb-2">03 / trusted evidence</p>
            <h3 className="text-sm font-medium text-white mb-2">Check &amp; decide</h3>
            <p className="text-xs text-neutral-400 leading-relaxed">
              Provider traces, independent state checks, deterministic assertions,
              LLM rubrics, and human regression review.
            </p>
          </li>
        </ol>
        <p className="border-l-2 border-neutral-600 pl-4 text-xs leading-relaxed text-neutral-300 mt-5">
          Safety invariant: if approval, effective isolation, or required
          evidence cannot be verified, the evaluation is <strong className="font-medium text-white">blocked — not run</strong>.
        </p>
        <a
          href="https://github.com/rlynjb/dotskills/blob/main/skills/evaluate-skill/docs/evaluate_skill_system_boundary_map_v0_2.md"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block text-xs text-neutral-300 underline underline-offset-4 hover:text-white mt-4"
        >
          full system boundary map ↗
        </a>
      </section>

      <section className="mb-12" aria-labelledby="decisions-heading">
        <h2 id="decisions-heading" className="text-base font-medium text-white mb-3">
          04 / design decisions &amp; trade-offs
        </h2>
        <dl className="divide-y divide-neutral-800 border-y border-neutral-800">
          {decisions.map((decision) => (
            <div key={decision.title} className="py-4">
              <dt className="text-sm font-medium text-neutral-100 mb-1">
                {decision.title}
              </dt>
              <dd className="text-xs text-neutral-400 leading-relaxed">
                {decision.reason}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mb-12" aria-labelledby="status-heading">
        <h2 id="status-heading" className="text-base font-medium text-white mb-4">
          05 / implementation status
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 text-sm">
          <div>
            <h3 className="text-sm font-medium text-neutral-100 mb-2">Implemented offline</h3>
            <ul className="list-disc pl-4 space-y-2 text-xs text-neutral-400 leading-relaxed">
              <li>Evaluate Skill package and 12-stage guided methodology</li>
              <li>Claude- and Codex-specific test case preparation</li>
              <li>Run-plan, approval, policy, and evidence-checking modules</li>
              <li>Offline probes, bounded/mock authorization interfaces, and test coverage</li>
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-medium text-neutral-100 mb-2">Not yet verified live</h3>
            <ul className="list-disc pl-4 space-y-2 text-xs text-neutral-400 leading-relaxed">
              <li>Independently enforced native execution boundary</li>
              <li>End-to-end model evaluations and regression comparisons</li>
              <li>Verified Docker fallback for cases native isolation cannot support</li>
            </ul>
          </div>
        </div>
        <p className="text-xs text-neutral-500 leading-relaxed mt-5">
          Current evidence comes from repository code, offline tests, and
          design documents—not a published live evaluation benchmark.
        </p>
      </section>

      <section className="mb-12" aria-labelledby="next-heading">
        <h2 id="next-heading" className="text-base font-medium text-white mb-3">
          06 / next milestone
        </h2>
        <p className="text-sm leading-relaxed text-neutral-300">
          Prove one authorized, isolated evaluation end to end: verify the
          execution boundary, run paired cases, collect independent evidence,
          and compare quality and safety outcomes without conflating them.
          Publish sanitized results once they exist.
        </p>
        <a
          href="https://github.com/rlynjb/dotskills/blob/main/skills/evaluate-skill/docs/evaluate_skill_execution_architecture_v0_2.md"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block text-xs text-neutral-300 underline underline-offset-4 hover:text-white mt-4"
        >
          architecture and acceptance criteria ↗
        </a>
      </section>

      <footer className="border-t border-neutral-800 pt-5">
        <Link href="/" className="text-xs text-neutral-400 hover:text-white">
          ← back to featured projects
        </Link>
      </footer>
    </article>
  );
}
