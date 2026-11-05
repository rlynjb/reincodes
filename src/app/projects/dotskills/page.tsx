import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Evaluate Skill | Reincodes",
  description:
    "An evidence-driven, human-gated workflow for systematically testing, diagnosing, and improving agent skills—not judging instructions alone.",
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
    detail: "When approved Docker isolation is verified, run paired baselines and review observed behavior.",
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
    title: "Keep evaluation formats provider-specific",
    reason:
      "Claude plugin eval and Promptfoo with the Codex SDK use distinct cases and graders. One guided coordinator preserves each provider's evidence without inventing a cross-provider score.",
  },
  {
    title: "Require verified Docker-only execution",
    reason:
      "Every future live evaluation must run inside the approved, independently verified Docker boundary. Native sandboxes are not fallbacks; unverified isolation blocks execution.",
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
          Systematically testing, diagnosing, and improving agent skills with measurable evidence.
        </p>
        <p className="text-sm leading-relaxed text-neutral-400 max-w-[620px]">
          Well-written instructions do not guarantee reliable agent behavior.
          Evaluate Skill creates a repeatable, human-gated way to define
          expected outcomes, test real behavior, diagnose failures, and verify
          approved improvements through comparable evidence. Its 12 stages
          support separate Claude Code and Codex evaluation routes.
        </p>
        <div className="flex flex-wrap gap-x-5 gap-y-2 mt-5 text-xs">
          <a
            href="https://github.com/rlynjb/dotskills/tree/main/skills/evaluate-skill"
            target="_blank"
            rel="noopener noreferrer"
            className="text-neutral-200 underline underline-offset-4 hover:text-white"
          >
            Evaluate Skill source ↗
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
          A skill can be structurally valid and still fail its actual job:
          inventing facts, skipping a required checkpoint, producing
          unsupported answers, or attempting an unauthorized tool action.
          Reviewing instructions alone cannot reveal these failures.
          Evaluate Skill approaches improvement as an evidence-driven
          engineering problem rather than a prompt-editing exercise.
        </p>
      </section>


      <section className="mb-12" aria-labelledby="workflow-heading">
        <h2 id="workflow-heading" className="text-base font-medium text-white mb-3">
          02 / how Evaluate Skill works
        </h2>
        <p className="text-sm leading-relaxed text-neutral-300 mb-5">
          Four phases organize the 12 stages: define measurable expectations,
          prepare approved test cases, compare actual outputs when safe
          execution is available, diagnose the evidence, and recheck
          regressions before a human decides what to keep.
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
        <p className="text-xs text-neutral-400 leading-relaxed mt-4">
          Example criteria include factual grounding, task correctness,
          required checkpoints, prohibited tool effects, and regression
          behavior. Grades and scores are interpreted alongside actual
          outputs and trusted traces—not treated as proof by themselves.
        </p>
        <p className="text-xs text-neutral-500 leading-relaxed mt-3">
          Executing an evaluation requires separate approval and a verified
          Docker boundary. Preparing a test is not the same as running a model
          or producing a passing grade.
        </p>
      </section>

      <section className="mb-12" aria-labelledby="use-case-heading">
        <h2 id="use-case-heading" className="text-base font-medium text-white mb-3">
          03 / applied example: evaluating Learn Repo
        </h2>
        <p className="text-sm leading-relaxed text-neutral-300 mb-5">
          Learn Repo is the skill being tested—not the focus of this case
          study. With a small synthetic Python CLI repository, Evaluate Skill
          defines assertions for correct module identification, source-backed
          explanations, and a required learner checkpoint. The prepared
          cases specify expected behavior and prohibited effects, but do not
          establish a behavioral pass.
        </p>
      </section>

      <section className="mb-12" aria-labelledby="architecture-heading">
        <h2 id="architecture-heading" className="text-base font-medium text-white mb-2">
          04 / Evaluate Skill architecture
        </h2>
        <p className="text-xs leading-relaxed text-neutral-500 mb-5">
          Evaluate Skill v0.4: the Docker-only execution design and offline
          control, runner, and evidence components are implemented and tested.
          Real Docker provisioning and no-model isolation probes are still
          pending; live paired model evaluation remains blocked—not run.
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
              One provider-specific route inside the verified Docker-only
              boundary, with approved mock tools and protected credentials.
              Provider-native sandboxes are not execution fallbacks.
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
          href="https://github.com/rlynjb/dotskills/blob/main/skills/evaluate-skill/docs/evaluate_skill_system_boundary_map_v0_4.md"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block text-xs text-neutral-300 underline underline-offset-4 hover:text-white mt-4"
        >
          full system boundary map ↗
        </a>
      </section>

      <section className="mb-12" aria-labelledby="decisions-heading">
        <h2 id="decisions-heading" className="text-base font-medium text-white mb-3">
          05 / design decisions &amp; trade-offs
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
          06 / implementation status
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 text-sm">
          <div>
            <h3 className="text-sm font-medium text-neutral-100 mb-2">Implemented offline</h3>
            <ul className="list-disc pl-4 space-y-2 text-xs text-neutral-400 leading-relaxed">
              <li>Evaluate Skill package and 12-stage guided methodology</li>
              <li>Claude- and Codex-specific test case preparation</li>
              <li>Approved run-plan, policy, and evidence-checking modules</li>
              <li>Docker-only runner and gateway contracts with offline test coverage</li>
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-medium text-neutral-100 mb-2">Not yet verified live</h3>
            <ul className="list-disc pl-4 space-y-2 text-xs text-neutral-400 leading-relaxed">
              <li>Real Docker provisioning and accepted no-model isolation probes</li>
              <li>Authorized live paired model evaluations and trustworthy traces</li>
              <li>Measured before/after improvements and regression comparisons</li>
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
          07 / next milestone
        </h2>
        <p className="text-sm leading-relaxed text-neutral-300">
          First verify the Docker-only host and no-model isolation probes.
          Then authorize one paired with-skill / without-skill evaluation,
          inspect trusted quality and safety evidence, and compare results
          before deciding whether an improvement worked. Publish sanitized
          measurements only when they exist.
        </p>
        <a
          href="https://github.com/rlynjb/dotskills/blob/main/skills/evaluate-skill/docs/evaluate_skill_execution_architecture_v0_4.md"
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
