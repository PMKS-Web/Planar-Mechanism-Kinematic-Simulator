---
name: oracle
description: Regenerate and triage the numerical oracle's references (oracle/, Exudyn). Use when adding or changing a gallery fixture or library template, changing a PMKS+ solver, touching src/test-data/oracle or oracle/, or when oracle.spec.ts, oracle-problems.spec.ts or oracle-matlab.spec.ts fails.
---

# The numerical oracle

This skill has one home: **read [`.claude/skills/oracle/SKILL.md`](../../../.claude/skills/oracle/SKILL.md)
and follow it.** This file only points there, so the two copies cannot drift apart.

The short version: `npm run oracle` regenerates, a disagreement goes to
`src/test-data/oracle/manifest.ts` with a GitHub issue, and a PMKS+ solver is never changed to make
the oracle spec pass.
