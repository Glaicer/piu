# Pi OpenTUI

A terminal UI for the Pi coding agent, built on OpenTUI + Solid. Work is planned in `.scratch/pi-opentui/` (spec and numbered tickets). Use the vocabulary in `GLOSSARY.md`. A bare "extension" means this project's Extension, so say "Pi extension" for Pi's.

## Rules that are easy to get wrong

- **Never write OpenTUI or Pi API calls from memory.** OpenTUI 0.8.x is young and changes fast, and Pi's RPC protocol is specific to each version. Check OpenTUI in Context7 (`/websites/opentui`) and Pi in the docs shipped in `node_modules/@earendil-works/pi-coding-agent/docs/` (`rpc.md`, `rpc-commands.md`, `rpc-extension-ui.md`, `json.md`) against the installed version before using any API. Exact signatures for the installed version live in `node_modules`: Pi's protocol in `@earendil-works/pi-coding-agent/dist/modes/rpc/rpc-types.d.ts` and `dist/modes/json-event.d.ts`, Solid element props in `@opentui/solid/src/types/elements.d.ts`, renderable options in `@opentui/core/renderables/*.d.ts`, and the test renderer in `@opentui/core/testing/*.d.ts`.
- **Runtime is Bun.** OpenTUI needs Bun ≥ 1.3.14 or Node ≥ 26.4, and Node 24 can't run it. `pnpm check` runs tsc, Biome and `bun test`.
- **Solid typings under OpenTUI's JSX have two traps.** `<input onSubmit>` types its argument as `string | SubmitEvent`, so write a handler with no arguments that reads the value from a signal. The function child of `<Show when>` gets an implicit `any` parameter, so compute the value once and render `value && <…/>` instead.
- **Pi is a subprocess over RPC, never in-process.** Don't call `createAgentSession` from the app (ADR-0001). Talk to it through the app's own Backend client, not Pi's `RpcClient`, which can only run `node <cli.js>` and copies the child's stderr to our terminal. Frame stdout as LF-only JSONL, never with `readline`, which splits on `U+2028/2029` inside JSON. Never write the Backend's stderr to the terminal. `@earendil-works/pi-coding-agent` is a dev dependency: import only its protocol types, plus the test binary.
- **Tests never touch the developer's Pi.** In the author's shell, `pi` is a function that runs Pi-Bolt under a sandbox. Tests run the pinned dev-dependency `pi` binary directly, with `PI_CODING_AGENT_DIR` set to a temp dir, `PI_OFFLINE=1` and `--no-session`, and the faux model from `@earendil-works/pi-ai`.
- **A duplicate tool name is a hard startup failure on Pi-Bolt** (ADR-0001). Check with `bun scripts/pi-bolt-compat/run.ts`, a manual script that needs your real agent dir: an empty one has no compiled-in Pi extensions.
- **The default Backend in `config.ts` stays `pi`.** Personal settings such as `pi-bolt` go in `config.json`, which is git-ignored, as is the `extensions/` folder except its README. Never commit either.

## Agent skills

### Issue tracker

Issues and specs live as local markdown files under `.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary, recorded as a `Status:` line in each issue file. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
