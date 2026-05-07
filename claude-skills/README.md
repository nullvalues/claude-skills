# Claude Code skills — staging area

These are user-scoped Claude Code skills authored in this repo so they can
travel via git. They are intended to live at `~/.claude/skills/` on your
machine, where Claude Code picks them up automatically. They are NOT meant
to be loaded by Claude Code while you're working in this repo — placing
them under `tools/` rather than `.claude/skills/` keeps that boundary
explicit.

## Install

```bash
mkdir -p ~/.claude/skills
cp -r tools/claude-skills/ba-totp-uat-harness ~/.claude/skills/
cp -r tools/claude-skills/uat-harness         ~/.claude/skills/
```

After that, in any other repo:

```
/ba-totp-uat-harness     # tight: BA + twoFactor (TOTP) projects
/uat-harness             # medium: any auth stack, pluggable driver
```

Or just describe the task ("set up Playwright UAT for this app") and let
Claude pick the matching skill from the descriptions.

## What they do

Both scaffold a Playwright UAT harness whose authentication runs against
the project's real auth API rather than mocking it. The output is a
Playwright `storageState` so authenticated specs start past every gate
the production stack enforces.

- **`ba-totp-uat-harness`** — Next.js + Better Auth + the `twoFactor`
  plugin with mandatory TOTP enforcement. Assumes BA HTTP routes at
  `/api/auth/...`. Drops in 9 files plus snippets to merge into
  `package.json`, `tsconfig.json`, `.gitignore`, `.env.local.example`.

- **`uat-harness`** — any auth stack. Discovers the project's auth
  library, picks a canonical driver from `templates/auth-drivers/` if
  one matches, otherwise instructs the agent to write one that satisfies
  the `AuthDriver` interface. The cookie-jar → storageState plumbing in
  `global-setup.ts` is auth-agnostic.

The first canonical driver in `uat-harness/templates/auth-drivers/` is
`better-auth-totp.ts` — the same logic as the tight skill, refactored
to satisfy the `AuthDriver` interface. So you can use the medium skill
on BA projects too without it being any slower.

## Updating

These skills were initially derived from forqsite's own e2e harness
(`/e2e/`). If you discover an improvement while using them on another
project, update the copy in `~/.claude/skills/<skill>/`, then mirror the
fix back here so it ships with this repo on the next checkout.

## Why not `.claude/skills/`?

`.claude/skills/` is the project-scoped skill location — Claude Code
auto-loads anything under it when running in that repo. forqsite already
has its own `e2e/` harness; auto-loading "scaffold a UAT harness" here
would suggest doing work that's already done. Keeping the skills under
`tools/claude-skills/` makes them obviously transit material, copy-out
only.
