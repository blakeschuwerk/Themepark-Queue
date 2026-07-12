---
name: themepark-queue-docs
description: >
  Mandatory documentation discipline for ANY work in Themepark-queue (Queue Brain —
  Block Logic Sandbox). Enforces logging every real change to TIMELINE.md and every
  notable decision to DECISIONS.md, so project history is never lost again.
---

# Themepark-queue Documentation Skill

**Stop. Before you end a turn that changed code, design, or scope in this repo, update
the project's history.** This project went from 07-09 to 07-11 with zero recorded
history until the user asked for it explicitly — don't let that happen again.

## The two logs

- **[docs/TIMELINE.md](docs/TIMELINE.md)** — a dated, chronological log of *what
  happened*. Newest entries at the bottom of each day. One entry per real chunk of
  work (not per tool call) — a bug fix, a feature, a lesson rewrite, a subagent's
  output. Reconstructed back to 2026-07-09 from `orchestration_state.json`; log live
  from 2026-07-11 onward.
- **[docs/DECISIONS.md](docs/DECISIONS.md)** — a numbered `D`-series log of *why*
  notable choices were made, with rejected alternatives where relevant. Not every
  timeline entry needs a decision entry — only ones where a real judgment call was
  made (an architecture choice, a trade-off, a naming call, a "this bends the spec
  because..."). Never rewrite or delete an old D-entry; if a decision is reversed,
  add a new one that says "Supersedes D<n>."

## The rule

1. **Before finishing any turn that changed code, lesson content, or design**, append
   to `TIMELINE.md` (always) and to `DECISIONS.md` (if a judgment call was involved).
2. **Match the existing tone and structure** — read the last few entries of each file
   first. TIMELINE entries are terse bullet lists grouped under a `## YYYY-MM-DD —
   title` heading; DECISIONS entries follow the `### D<n> — title` / date / area /
   body-with-**Why:**-and-**How to apply:**-or-**Trade-off:**/**Rejected:** shape.
3. **Append, never rewrite.** Old entries are a historical record — if something turns
   out to be wrong later, add a new entry that corrects or supersedes it; don't erase
   what actually happened.
4. **This applies to subagents too.** If you delegate work to a spawned agent, that
   agent's own final instructions must include "append to docs/TIMELINE.md and
   docs/DECISIONS.md before reporting back" — don't let a subagent's changes go
   unlogged just because it wasn't the top-level session.
5. **Big pushes to the vision, story, or long-term design** — not just code changes —
   belong in TIMELINE/DECISIONS too if they change direction (e.g. "pivoted lesson 15's
   approach," "decided against a game-engine rewrite," "user clarified the endgame is a
   full theme-park sim"). The user is a non-coder describing an evolving vision over
   many sessions; if you don't write down the *why* now, a future session will silently
   contradict it.

## Why this exists

The user explicitly said, after finding no history at all through 07-11: *"THIS IS
CRITICAL. YOU NEED TO START DOCUMENTING THE DEVELOPMENT OF THIS APP BECAUSE WE HAVENT
BEED DOING IT."* Treat that as a standing instruction for every future session, not a
one-time request.
