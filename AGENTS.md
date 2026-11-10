# Pi OpenTUI

A terminal UI for the Pi coding agent, built on OpenTUI + Solid. Work is planned in `.scratch/pi-opentui/` (spec and numbered tickets). Use the vocabulary in `GLOSSARY.md`. A bare "extension" means this project's Extension, so say "Pi extension" for Pi's.

## Rules that are easy to get wrong

- **Never write OpenTUI or Pi API calls from memory.** OpenTUI 0.8.x is young and changes fast, and Pi's RPC protocol is specific to each version. Check OpenTUI in Context7 (`/websites/opentui`) and Pi in the docs shipped in `node_modules/@earendil-works/pi-coding-agent/docs/` (`rpc.md`, `rpc-commands.md`, `rpc-extension-ui.md`, `json.md`) against the installed version before using any API.
- **Runtime is Bun.** OpenTUI needs Bun ≥ 1.3.14 or Node ≥ 26.4, and Node 24 can't run it. Run tests with `bun test`.
- **Pi is a subprocess over RPC, never in-process.** Don't call `createAgentSession` from the app (ADR-0001). Talk to the Backend through the exported `RpcClient`. Don't parse its stdout with `readline`, which splits on `U+2028/2029` inside JSON.
- **Tests never touch the developer's Pi.** In the author's shell, `pi` is a function that runs Pi-Bolt under a sandbox. Tests run the pinned dev-dependency `pi` binary directly, with `PI_CODING_AGENT_DIR` set to a temp dir, `PI_OFFLINE=1` and `--no-session`, and the faux model from `@earendil-works/pi-ai`.
- **The default Backend in `config.ts` stays `pi`.** Personal settings such as `pi-bolt` go in `config.json`, which is git-ignored, as is the `extensions/` folder except its README. Never commit either.

## Agent skills

### Issue tracker

Issues and specs live as local markdown files under `.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary, recorded as a `Status:` line in each issue file. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
