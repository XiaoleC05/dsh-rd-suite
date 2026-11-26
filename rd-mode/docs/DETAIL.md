# R&D mode

Agent presets for software engineering, testing, websites, data, and AI/agent work.

## Presets
- **研发模式 (rd)**: the main mode. Every task is tiered first (L0 Q&A, L1 small change, L2 standard, L3 complex or risky) and follows a spec → plan → build → verify → independent review → report pipeline by tier. Domain standards load on demand as skills, and context is compacted at about 199k tokens.
- **研发·侦察 (rd-scout)**: a read-only scout and the default subagent; replies in 40 lines or fewer.
- **研发·验收 (rd-review)**: an independent reviewer without the author's context; runs the checks itself and returns PASS or FAIL.

## Use
1. Pick 研发模式 when starting a session and describe the task, ideally with acceptance criteria.
2. After installing or upgrading, send `/rd-selftest`.
3. Run `/rd-retro` weekly (or as an automation task) and approve the proposed improvements.

Files: `preset.patch.yml`, `skills/`, `docs/DESIGN.md` (design, in Chinese), `INIT.md` (setup and maintenance), `evolution/` (KPI reports, proposals, registry, changelog).
