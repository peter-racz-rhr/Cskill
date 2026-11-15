# Cskill

My collection of agent skills. Each skill lives in its own folder under `skills/`,
with a `SKILL.md` at its root.

| Skill | What it does | Source |
|---|---|---|
| [`modern-web-guidance`](skills/modern-web-guidance) | Looks up current HTML/CSS/client-side JS best practices before writing web UI code (uses `npx modern-web-guidance`). | [GoogleChrome/modern-web-guidance](https://github.com/GoogleChrome/modern-web-guidance) |
| [`chrome-extensions`](skills/chrome-extensions) | Building and publishing Manifest V3 Chrome extensions. | [GoogleChrome/modern-web-guidance](https://github.com/GoogleChrome/modern-web-guidance) |

The Google skills are copied unmodified; see `skills/LICENSE-google-modern-web-guidance`.

## Using with Claude Code

`.claude/skills/` holds symlinks into `skills/`, so Claude Code picks them up automatically
when this repo is open. To use a skill in another project, copy its folder into that
project's `.claude/skills/` (or `~/.claude/skills/` for all projects).

## Adding a skill

1. Create `skills/<skill-name>/SKILL.md` with `name` and `description` front matter.
2. Link it: `ln -s ../../skills/<skill-name> .claude/skills/<skill-name>`
3. Add a row to the table above.
