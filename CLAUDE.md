@AGENTS.md

## Claude Code specifics

- The playbooks in `.claude/skills/` load as project skills: `/i18n-copy`, `/add-section`, `/content-posts`, `/pages-function`, `/ship-check`.
- `.claude/settings.json` pre-approves the verify loop and read-only `git`/`gh` commands, and asks before any `wrangler` command.
- After every Edit/Write it runs `.claude/hooks/post-edit.mjs`, which runs the i18n check. A failure comes back to you as hook feedback; fix it before moving on.
- Put personal overrides in `.claude/settings.local.json` (git-ignored).
