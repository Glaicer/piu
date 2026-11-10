# Pi OpenTUI

A terminal UI for the Pi coding agent, built on OpenTUI + Solid. Work is planned in `.scratch/pi-opentui/` (spec and numbered tickets). Use the vocabulary in `GLOSSARY.md`. A bare "extension" means this project's Extension, so say "Pi extension" for Pi's.

## Rules that are easy to get wrong

- **Never write OpenTUI or Pi API calls from memory.** OpenTUI 0.8.x is young and changes fast, and Pi's RPC protocol is specific to each version. Check OpenTUI in Context7 (`/websites/opentui`) and Pi in the docs shipped in `node_modules/@earendil-works/pi-coding-agent/docs/` (`rpc.md`, `rpc-commands.md`, `rpc-extension-ui.md`, `json.md`) against the installed version before using any API. Exact signatures for the installed version live in `node_modules`: Pi's protocol in `@earendil-works/pi-coding-agent/dist/modes/rpc/rpc-types.d.ts` and `dist/modes/json-event.d.ts`, Solid element props in `@opentui/solid/src/types/elements.d.ts`, renderable options in `@opentui/core/renderables/*.d.ts`, and the test renderer in `@opentui/core/testing/*.d.ts`. Runtime behaviour the `.d.ts` hides (setter validation, hit-testing) is in `@opentui/core/index.bun.js` and `chunk-bun-*.js`; grep there. Pi behaviour its docs omit (retries, refusing to compact, turns that end in an error) is in `@earendil-works/pi-coding-agent/dist/core/agent-session.js`, `@earendil-works/pi-ai/dist/utils/retry.js` and `pi-agent-core/dist/agent-loop.js`; `dist/bundle/` is minified, so never grep it.
- **Runtime is Bun.** OpenTUI needs Bun ≥ 1.3.14 or Node ≥ 26.4, and Node 24 can't run it. `pnpm check` runs tsc, Biome and `bun test`.
- **Solid typings under OpenTUI's JSX have two traps.** `<input onSubmit>` types its argument as `string | SubmitEvent`, so write a handler with no arguments that reads the value from a signal. The function child of `<Show when>` gets an implicit `any` parameter, so compute the value once and render `value && <…/>` instead.
- **OpenTUI silently drops style values its setter doesn't accept** (e.g. `flexBasis: "0%"` is ignored and stays `auto`), and props with no setter at all: Solid builds each element with only `{ id }` and then assigns props, so a constructor-only option such as `<markdown treeSitterClient>` never arrives. A layout probe can pass for the wrong reason. Stay within the typed props and test layouts with content in the Panels.
- **Modified keys need the kitty protocol in tests.** Without it a terminal sends Shift+Enter as plain Enter, so `startPiu` turns on `kittyKeyboard` (the real renderer does by default); Alt arrives as `meta`. `<textarea>`'s default bindings are the reverse of a chat prompt (Enter inserts a newline, Alt+Enter submits), so the prompt routes keys in `onKeyDown` and calls `event.preventDefault()` to skip them.
- **Biome's a11y rules are DOM-only.** When one fires on an OpenTUI element (`<box onMouseDown>`), turn that rule off in `biome.json` (`noStaticElementInteractions` already is) instead of suppressing it inline.
- **Pi is a subprocess over RPC, never in-process.** Don't call `createAgentSession` from the app (ADR-0001). Talk to it through the app's own Backend client, not Pi's `RpcClient`, which can only run `node <cli.js>` and copies the child's stderr to our terminal. Frame stdout as LF-only JSONL, never with `readline`, which splits on `U+2028/2029` inside JSON. Never write the Backend's stderr to the terminal. `@earendil-works/pi-coding-agent` is a dev dependency: import only its protocol types, plus the test binary.
- **Tests never touch the developer's Pi.** In the author's shell, `pi` is a function that runs Pi-Bolt under a sandbox. Tests run the pinned dev-dependency `pi` binary directly, with `PI_CODING_AGENT_DIR` set to a temp dir, `PI_OFFLINE=1` and `--no-session`, and the faux model from `@earendil-works/pi-ai`. A test that needs a saved session (Restart, `-c`) sets `persistSession` instead of `--no-session`; the temp agent dir still keeps it away from the real one.
- **Tests go through `startPiu`** (`test/harness.ts`), the seam spec.md already agreed, so use it without confirming a seam. A test that passes on its first run isn't done until you break the code under test on purpose and watch it go red; the Restart test once passed on stale state alone. Copy the file to the scratchpad before breaking it, because `git checkout` can't restore uncommitted work. A `waitForFrame` predicate waits for everything the test asserts next, or the first matching frame can be mid-render (`isFormatted` flaked this way). Run a new file of frame tests 10–15 times in a row before closing the ticket.
- **Native frame stats can't see re-highlighting.** `getNativeStats().frameWork` misses JS and worker work. To bound streaming render cost, spy on `getTreeSitterClient().highlightOnce` (the singleton `CodeRenderable` uses by default) and bound what each call highlights. This is the agreed seam for render-cost tests.
- **Scripted replies can be steps** (`FauxStep` in `test/harness.ts`: `thinking`, `text`, `toolCalls`, `error`). A step with tool calls needs another reply after it, because Pi calls the model again with the result. An `error` such as `529 overloaded` is retried, while `400 invalid request` is not. A compaction spends two scripted replies. Assert "running" with a slow `bash` command (`sleep 0.6`), since `read` finishes between frame polls.
- **Fixture Extensions live under `test/fixtures/`, inside the repo.** A temp dir cannot resolve `solid-js`, `@opentui/solid` or the `tsconfig` JSX settings, so a `.tsx` fixture written there fails to import.
- **Bun's module cache is shared by every test in a file.** To assert that an Extension was or was not loaded, use a fixture that no other test places, or the result depends on test order.
- **Config merge:** objects merge by key, while arrays and `layout` replace. A replaced `layout` drops the default Placement entries for Panels the new tree lacks, but a `placement` key you write for a missing Panel is a startup error.
- **A duplicate tool name is a hard startup failure on Pi-Bolt** (ADR-0001). An Extension's Pi extension never reuses another tool's name. To replace a tool, register your own name and remove the old one with `pi.setActiveTools()`. Check with `bun scripts/pi-bolt-compat/run.ts`, a manual script that needs your real agent dir: an empty one has no compiled-in Pi extensions.
- **The default Backend in `config.ts` stays `pi`.** Personal settings such as `pi-bolt` go in `config.json`, which is git-ignored, as is the `extensions/` folder except its README. Never commit either.

## Agent skills

### Issue tracker

Issues and specs live as local markdown files under `.scratch/<feature>/`. Before committing a finished ticket, close it: tick its checkboxes, set `Status: done`, and record every deviation from the ticket under `## Comments`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary, recorded as a `Status:` line in each issue file. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
