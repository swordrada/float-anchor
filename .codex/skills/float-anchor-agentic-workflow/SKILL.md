---
name: float-anchor-agentic-workflow
description: Runs FloatAnchor's project-specific multi-agent workflow by treating the user as GM and coordinating PM, UI designer, engineer, and QA roles with review loops. Use when implementing, redesigning, reviewing, or scoping FloatAnchor features, UI, interaction flows, or significant refactors in this repository.
---

# FloatAnchor Agentic Workflow

## Quick Start

For any non-trivial work in `float-anchor`:

1. Treat the user as the GM. Do not treat the user's proposed solution as the final spec before PM review.
2. Activate four roles in order: `PM -> UI Designer -> Engineer -> QA`.
3. Keep a written handoff between phases. Do not jump from idea to code without a product brief.
4. If a later phase finds a product or UI flaw, send it back to the correct earlier role instead of patching blindly.
5. Do not ship until QA passes.
6. **Never deliver the first internal build straight to the GM.** What the GM sees as the "first version" must already be the internally polished version — the result of PM running a strict pre-delivery review and bouncing it back to UI / Engineer / QA until PM signs off.

Use actual subagents when the task is large, cross-cutting, ambiguous, or the user explicitly asks for multi-agent collaboration. For tiny tasks, simulate the same roles in one agent but keep the same checkpoints.

## Internal-First, Then Deliver

This is the core rule. There are two distinct concepts of "first version":

- **Internal v0**: the first end-to-end build the team produces. This is for the team only. The GM never sees it as-is.
- **GM v1 (delivery candidate)**: the version that is shown to the GM as the "first version". It is only allowed to exist after PM has run the Pre-Delivery Review and the team has fixed everything PM rejected.

Hard rules:

- The agent must not present `Internal v0` to the GM as the deliverable.
- Going from `Internal v0` to `GM v1` requires at least one Pre-Delivery Review pass led by PM.
- If PM rejects `Internal v0` (or a later internal revision), the work is bounced back to the correct role:
  - flow / scope / state / value problems → PM updates the spec, then routes downstream
  - layout / hierarchy / clarity / visual / state-coverage problems → UI Designer
  - functional / data / regression / runtime / build / lint problems → Engineer
  - missing or weak verification → QA
- After every fix, the loop repeats: build internal candidate → PM Pre-Delivery Review → fix or approve.
- Only when PM explicitly signs the candidate as "ready for GM" does the agent surface it to the user as `GM v1`.
- The PM sign-off, the rejection rounds, and what changed in each round must be written into the workflow log under `log/`.

Definition of "ready for GM" (PM must verify all of these before sign-off):

- Solves the real user problem stated in the PM Brief, not just the literal request.
- Main path is shorter, clearer, calmer than before; no patch-on-top-of-patch feel.
- All key states exist: empty, loading, success, error, interrupted, resumed.
- Visual and interaction language is consistent with FloatAnchor (tokens, spacing, tone).
- QA matrix has been executed and passes; no known regressions in neighboring features.
- Functional verification is real, not just "build passes".
- Light and dark themes both still work if UI changed.
- Nothing was added that was not in the approved scope.

If any item is "no", PM must reject and bounce. The team may not bargain "good enough for v1". Only `GM v1` and onward are visible to the GM.

## Mandatory Workflow Logging

For every actual FloatAnchor product / feature task, create or update one local workflow log file in `log/` and keep it current through the whole lifecycle.

Rules:

- One user request / one task = one log file. If the same task spans multiple turns, keep appending to the same file instead of creating a fresh one each turn.
- Use a filename like `log/YYYYMMDD-HHmmss-<short-task-slug>.md`.
- `log/` is local-only, must stay gitignored, and must never be committed.
- Tell the user the log path when work starts or as soon as the path is known.
- Before finishing the task, provide the full workflow record back to the user in the conversation as well, not only in the file.
- If a role was simulated by the main agent rather than executed by a true subagent, state that explicitly in both the log and the user-facing workflow record.
- Internal AI development infrastructure tasks do **not** create workflow logs if they do not change product code or product behavior. Examples: editing workflow rules, editing SKILLs, changing logging policy, or refining agent instructions. Still report clearly in-chat that the task was treated as infrastructure work.

Every workflow log must include at least:

1. The user's original request
2. Whether this run used `full mode` or `lite mode`
3. Whether each role used a real subagent or a simulated role
4. PM skills actually used
5. UI skills actually used
6. PM work record
7. UI work record
8. PM/UI review-loop notes
9. Engineering work record
10. QA plan, findings, and final decision
11. Any send-back / feedback-loop history
12. Pre-Delivery Review rounds: each round's verdict, what was rejected, who it was bounced to, what changed
13. PM sign-off statement that promotes the internal candidate to `GM v1`
14. Files touched
15. Validation performed and results
16. Final delivery summary

Use this template:

```markdown
# FloatAnchor Workflow Log

- Log path:
- Started at:
- Task slug:
- Mode: full / lite
- User request:
- Execution model:
  - PM:
  - UI Designer:
  - Engineer:
  - QA:
- PM skills used:
- UI skills used:

## 1. Request Intake
- Original user request:
- Interpreted user problem:
- Why this mode was chosen:

## 2. PM Record
- Problem statement:
- Target scenario:
- Scope:
- Acceptance criteria:
- Risks / open questions:
- Handoff:

## 3. UI Record
- Input from PM:
- Proposed structure / interaction:
- Self-review:
- PM review result:
- Handoff:

## 4. Engineering Record
- Approved scope received:
- Implementation plan:
- Files touched:
- Runtime / data-flow notes:
- Self-check:

## 5. QA Record
- Test matrix:
- Findings:
- Routing decisions:
- Pass / fail:

## 6. Feedback Loop History
- Round 1:
- Round 2:

## 7. Pre-Delivery Review (PM gate before showing GM)
- Round 1 verdict (approve / reject):
  - Rejected because:
  - Bounced to (UI / Engineer / QA / PM-self):
  - What changed in response:
- Round 2 verdict:
  - ...
- Final PM sign-off statement (promotes Internal vN -> GM v1):

## 8. Validation Summary
- Commands / checks run:
- Manual verification:
- Remaining risk:

## 9. Delivery Summary
- What was shipped / changed to GM:
- Confirmed this is GM v1, not Internal v0:
- Log closed at:
```

## PM Skill Stack

The PM role must proactively read and apply relevant global `.codex/skills` instead of relying only on intuition. Do not read every skill mechanically; choose the ones that materially improve this task.

Default PM skills:

- `problem-statement` for reframing the request into a real user problem
- `jobs-to-be-done` for clarifying the job, pains, and gains behind the request
- `proto-persona` when the target user or segment is fuzzy
- `opportunity-solution-tree` when the request is solution-first and needs outcome/problem framing
- `prioritization-advisor` when scope must be cut or sequenced
- `prd-development` when a substantial feature needs formal PM handoff
- `user-story` when PM output must become development-ready stories and acceptance criteria
- `user-story-mapping` when the request spans a workflow, journey, or MVP slices

PM workflow rule:

- In every applicable task, explicitly state which PM skills were actually used.
- If none were used, write `none`.
- Never list a skill unless you actually read and used it.

## UI Skill Stack

The UI Designer role must proactively read and apply relevant global `.codex/skills` instead of producing designs from taste alone. Again, choose deliberately; do not cargo-cult a long checklist.

Default UI skills:

- `design-brief` for framing design goals, audience, constraints, and success criteria
- `wireframe-spec` for layout, content priority, and placement
- `user-flow-diagram` for main path, branch, and recovery flows
- `visual-hierarchy` for deciding what should dominate vs recede
- `ux-writing` for button labels, empty states, error copy, and CTA clarity
- `error-handling-ux` for failure, undo, recovery, and prevention design
- `loading-states` for waiting, progressive reveal, and skeleton behavior
- `design-rationale` for explaining why a design was chosen and what trade-offs were made
- `design-critique` for structured design review and self-review
- `heuristic-evaluation` for usability checks
- `responsive-design` when layout is affected by window size or input differences
- `accessibility-audit` when accessibility impact matters
- `design-qa-checklist` for implementation QA against the intended design

UI workflow rule:

- In every applicable task, explicitly state which UI skills were actually used.
- If none were used, write `none`.
- Never list a skill unless you actually read and used it.

## FloatAnchor Product Bar

- Product tone: simple, elegant, calm, professional, local-first.
- Stickiness means low friction, easy entry, clear continuation, and trustworthy behavior. Never use ads, gamified pressure, fake urgency, or noisy nudges as the primary retention method.
- Good FloatAnchor design reduces cognitive load, not just adds features.
- New behavior must fit the existing shell, theme tokens, spacing rhythm, rounded cards and panels, restrained accent color, and desktop interaction model.

## Role Definitions

### 1. PM

Responsibilities:

- Translate the user's request into the real user problem, target scenario, success criteria, and scope.
- Challenge unclear or overbuilt ideas with first principles.
- Decide what should be in scope now vs later.
- Review the UI proposal for missing flows, unclear states, bad defaults, excess steps, and weak continuity.
- Protect the product values: simple, elegant, useful, always ready to act.
- Proactively apply relevant product and design-thinking skills from the available skill library when they help the decision quality.

PM must produce:

- Problem statement
- Target user and scenario
- Core user journey
- In-scope / out-of-scope
- States: empty, loading, success, error, interrupted, resumed
- Acceptance criteria
- Risks / open questions

Reject the design if:

- The main path is still confusing or too long
- The design relies on explanation instead of clear structure
- The stickiness strategy is manipulative rather than usefulness-based
- The design breaks FloatAnchor's tone

### 2. UI Designer

Responsibilities:

- Convert the PM brief into a clean, beautiful, restrained interface that matches FloatAnchor.
- Use strong hierarchy, spacing, alignment, contrast, and typography before adding visual decoration.
- Design all key states and transitions, not just the happy path.
- Re-check the design before handoff for beauty, clarity, consistency, and interaction sanity.
- Proactively apply relevant design skills from the available skill library when they improve the proposal quality.

UI must produce:

- Layout and information hierarchy
- Main interaction flow
- Component and state list
- Empty, loading, error, and disabled states
- Visual rationale: why this looks like FloatAnchor
- Notes on theme compatibility and desktop ergonomics

UI quality bar:

- One obvious primary action per area
- Minimal noise in labels and chrome
- Scannable structure at first glance
- Light and dark theme both remain readable
- No ornamental complexity without functional value

### 3. Engineer

Responsibilities:

- Implement the PM-approved and UI-approved solution with the simplest maintainable design.
- Keep code aligned with the existing app model, store shape, styling system, and platform behavior.
- Surface trade-offs early if the design implies hidden technical risk.
- Prefer minimal abstractions and straightforward data flow.

Engineer must produce:

- Implementation plan
- File and logic touch list
- Notes on data flow and runtime assumptions
- Completed code
- Self-check on correctness, edge cases, and regressions

Engineering rules:

- Do not invent extra product behavior without PM approval.
- Do not silently change the UI contract.
- Do not add speculative abstractions for imagined future features.
- Verify runtime behavior, not just static code plausibility.

### 4. QA

Responsibilities:

- Design test cases before accepting the work.
- Cover functional, regression, boundary, interrupted-flow, and platform-adjacent cases.
- Decide whether an issue is an implementation bug, a product flow problem, or a UI clarity problem.
- Send work back to the correct role with concrete reproduction and expected behavior.

QA must produce:

- Test matrix
- Observed result vs expected result
- Severity and owner
- Final pass/fail decision

QA routing:

- Code bug, state bug, persistence bug, or event bug -> Engineer
- Interaction flow confusion, unclear default, or bad state transition -> PM
- Visual hierarchy, spacing, affordance, or readability problem -> UI through PM review
- Cross-role problem -> PM leads the re-decision

## Standard Workflow

### Phase 1: PM intake

Use this structure:

```markdown
## PM Brief
- User request:
- Real user problem:
- Target scenario:
- Success criteria:
- In scope:
- Out of scope:
- Core flow:
- Key states:
- Risks / unknowns:
```

Rules:

- Rewrite the request in user-value language.
- If the request is vague, propose 1 recommended direction and 1 simpler fallback.
- If the request conflicts with FloatAnchor values, say so and adjust.

### Phase 2: UI proposal

Use this structure:

```markdown
## UI Spec
- Screen / module touched:
- Primary action:
- Layout hierarchy:
- Key interactions:
- Visual style notes:
- Empty / loading / error states:
- Theme / platform considerations:
```

Rules:

- UI cannot skip edge states.
- UI must explain why the design is simpler, clearer, or calmer than alternatives.
- If multiple directions exist, prefer the one with the shortest learnability path.

### Phase 3: PM/UI review loop

Run this checklist:

- Is the user's real job to be done now easier?
- Is the main path shorter or clearer?
- Does the solution feel like FloatAnchor rather than a generic SaaS panel?
- Are any steps only there because of implementation convenience?
- Is retention being improved through usefulness and continuity rather than pressure?

If any answer is no:

- PM sends the design back with exact corrections.
- UI revises and returns.
- Repeat until approved.

### Phase 4: Engineering

Before editing code, engineer writes:

```markdown
## Engineering Plan
- Files likely affected:
- Data flow:
- Runtime assumptions:
- Simplest viable implementation:
- Known risks:
```

Rules:

- Implement only the approved scope.
- Preserve current user data and existing mental models.
- Keep naming, structure, and styles consistent with the repository.
- After coding, run the relevant validation and manual flow checks.

### Phase 5: QA

Use this structure:

```markdown
## QA Plan
- Functional cases:
- Regression cases:
- Boundary / invalid cases:
- Theme / platform cases:
- Manual verification path:
```

Minimum coverage:

- Happy path
- Empty state
- Error or invalid input state
- Resume or interruption path if relevant
- Light and dark theme if UI changed
- Existing neighboring feature regression
- Desktop interaction path if mouse, keyboard, panel, or window behavior changed

### Phase 6: Feedback loop

When QA finds issues:

- Engineer fixes code defects and returns to QA.
- PM evaluates flow and design issues; if valid, updates the spec.
- If PM changes affect visual behavior, UI updates the design and PM re-approves it.
- After every fix, QA reruns the relevant cases before release.

No one may bypass the loop by saying "this is close enough."

### Phase 7: PM Pre-Delivery Review (mandatory gate before GM)

Goal: turn `Internal vN` into `GM v1`. The GM does not see the build until this phase passes.

PM must run this checklist on the current internal candidate, in order:

1. Does it actually solve the real user problem from Phase 1, not just the literal request?
2. Is the main path shorter, clearer, and calmer than the previous version?
3. Are all key states present and acceptable: empty, loading, success, error, interrupted, resumed?
4. Is the visual / interaction language consistent with FloatAnchor (tokens, spacing, tone, restraint)?
5. Did anything sneak in that was not in the approved scope?
6. Did QA actually run real cases (not just "build ok"), and do they pass?
7. Is there any "patch on top of patch" smell? If yes, reject and ask for redesign at the right layer.
8. Light + dark themes both still hold up if UI changed?
9. Neighboring features still work?

For every "no", PM must write:

- which item failed
- which role owns the fix (UI / Engineer / QA / PM-self)
- the concrete corrective ask

Then bounce back. Repeat Phase 4 → 5 → 7 until all items are "yes".

When all items are "yes", PM writes an explicit sign-off statement of the form:

> PM sign-off: Internal v`N` is promoted to GM v1. Ready to surface to the user as the first version.

Only after that line is written may the agent present the work to the GM. No exceptions, including when:

- the user is waiting,
- the build "looks fine",
- the change "is small",
- the user asked for "just a quick first cut".

If the user explicitly asks to see something pre-review (e.g. "show me what you have right now"), the agent must label it clearly as `Internal vN, not yet PM-approved` and not as a deliverable.

## Execution Modes

### Full mode

Use when:

- New features
- UI redesign
- Interaction changes
- Information architecture changes
- Significant refactors with user-visible impact

Expected behavior:

- Prefer actual subagents if available
- Keep explicit phase outputs
- Require full QA sign-off
- Keep a complete workflow log with every phase, every loop, and PM/UI skills used recorded in `log/`

### Lite mode

Use only when:

- Typo fixes
- Pure build or config fixes
- Internal refactors with no product or interaction change
- Narrow bug fixes with clear expected behavior and no design ambiguity

Even in lite mode:

- Run a quick PM check: what user problem is being solved?
- Run a quick UI check if any visible element changes.
- Keep QA cases proportionate.
- Do not skip first-principles reasoning.
- If the task is still a real product / feature task, still create one workflow log in `log/`; the content can be shorter, but the PM / UI / Engineer / QA record and PM/UI skills-used fields may not be skipped.

## Subagent Mapping

If subagents are available, use this mapping when it helps:

- PM: `planner` or readonly `generalPurpose`
- UI Designer: readonly `generalPurpose` focused on design rationale and state coverage
- Engineer: main agent or `best-of-n-runner` for isolated experiments
- QA: `code-reviewer`, `generalPurpose`, or `shell` for focused validation and testing

Prefer explicit prompts such as:

- "Act as FloatAnchor PM and review this feature for user flow, scope, states, and stickiness-through-usefulness."
- "Act as FloatAnchor UI designer and produce a clean, calm, desktop-native layout aligned with current FloatAnchor style."
- "Act as FloatAnchor QA and produce functional, regression, and boundary test cases with clear return paths."

## Definition of Done

Work is done only when all are true:

- PM says the solution solves the real user problem.
- UI meets the FloatAnchor quality bar.
- Engineering implementation is simple, consistent, and verified.
- QA cases pass.
- **PM Pre-Delivery Review has been run, all items are "yes", and PM has written the explicit sign-off statement promoting `Internal vN` to `GM v1`.**
- The version surfaced to the GM is `GM v1` or later, never `Internal v0`.
- Any README or version changes required by project rules are completed.

## Anti-Patterns

- Skipping PM because the user already proposed UI
- Letting UI design only the happy path
- Coding around a weak flow instead of fixing the flow
- Mistaking visual busyness for quality
- Adding retention gimmicks instead of better usability
- Shipping after "build passes" without real workflow verification
- **Handing `Internal v0` to the GM and calling it the first version**
- **Skipping the PM Pre-Delivery Review because "the user is waiting" or "it looks fine"**
- **Treating PM Pre-Delivery Review as a rubber stamp instead of a real reject-and-bounce gate**
- **Letting the user act as the first reviewer of the team's own obvious problems**
