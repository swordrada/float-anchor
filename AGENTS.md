# FloatAnchor Agent Entry

For any work in this repository:

1. Read and follow `.cursor/rules/dev-workflow.mdc`.
2. Default activate `.codex/skills/float-anchor-agentic-workflow/SKILL.md` for feature work, UI and UX changes, interaction changes, product design, and non-trivial refactors.
3. Treat the user as the GM and run the `PM -> UI Designer -> Engineer -> QA` workflow with feedback loops.
4. Never hand the team's internal first build (`Internal v0`) to the GM. The version shown to the GM as the "first version" (`GM v1`) must be the result of PM running a strict Pre-Delivery Review, bouncing the work back to UI / Engineer / QA as needed, and writing an explicit sign-off promoting `Internal vN` to `GM v1`. This applies in both full mode and lite mode.
5. Only real product / feature tasks create local workflow logs in `log/`; internal AI infrastructure work that does not change product code or product behavior does not create logs.
6. When a task does create a workflow log, explicitly record and report which PM skills and UI skills were actually used, plus every Pre-Delivery Review round and the final PM sign-off line.
7. `log/` is local-only and gitignored; do not commit workflow logs to GitHub.
8. Use lite mode only for clearly trivial product changes, but never skip first-principles reasoning, functional verification, QA self-check, the PM Pre-Delivery Review (even a short one), or required workflow logging.
9. If your client does not auto-load Cursor rules or project skills, read these files manually before planning or coding.
