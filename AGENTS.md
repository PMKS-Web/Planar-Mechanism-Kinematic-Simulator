# AGENTS.md

Guidance for Codex working in this repository.

## Read CLAUDE.md first

**[CLAUDE.md](CLAUDE.md) is the single description of this project** — what it is, how to
build and test it, the architecture, where things are on screen, and the conventions. Read it
before doing anything here. It applies to every agent, not just Claude.

This file used to restate that description in its own words, and the copy went stale: it
still claimed `mechanisms` only ever uses index 0 (multi-mechanism is the headline feature
now), described a `Piston` class and an `app.module.ts` that no longer exist, and counted
three left-panel tabs where there are four. Two governing documents that must be kept in
sync is how that happens, so this one now holds only what is specific to Codex.

## Second opinions / cross-review → Claude and Grok CLIs

When you want an independent review, a second opinion on a design decision, or a
cross-check of a tricky diagnosis, shell out to the other agent CLIs in one-shot mode.
Both need network access (and Claude needs macOS keychain access for auth), so run these
with escalated permissions / outside the sandbox if a sandboxed run fails.

- **Claude** — `claude -p "<question>"`. It reads stdin, which is the best way to hand it
  a diff or file:

  ```bash
  git diff | claude -p "Review this diff for correctness bugs; be specific and concise"
  ```

  Add `--allowedTools "Read Grep Glob"` to let it browse the repo read-only. Never grant
  write or Bash tools from a non-interactive call. Use `--model sonnet` or
  `--model haiku` for cheaper/faster answers when deep reasoning isn't needed.

  **Fable review recipe:** use `--model fable` and put `--` between the variadic
  `--allowedTools` argument and the prompt; otherwise Claude can consume the prompt as
  another allowed tool. For a diff review:

  ```bash
  git diff main...HEAD | claude -p --model fable --allowedTools "Read Grep Glob" -- \
    "Review this diff for correctness bugs and merge risks; be specific and concise."
  ```

  If a filesystem-reading review exits without plain-text output, rerun it with
  `--output-format stream-json --verbose`, record the `session_id` from the initial event,
  then read its persisted transcript at
  `~/.claude/projects/<encoded-cwd>/<session-id>.jsonl`. Extract completed findings with:

  ```bash
  jq -r 'select(.type == "assistant") | .message.content[]? | select(.type == "text") | .text' \
    ~/.claude/projects/<encoded-cwd>/<session-id>.jsonl
  ```

- **Grok** — `grok -p "<question>"`. It does **not** read stdin; embed the content in the
  prompt or name file paths (it is agentic and can read files in the working directory):

  ```bash
  grok -p "Review src/app/model/mechanism/position-solver.ts for numerical-stability issues; report findings only"
  ```

Keep calls single-shot, include all necessary context in the prompt (the callee does not
see your conversation), and tell the callee to answer directly and not to invoke
codex/claude/grok itself, to avoid recursion.
