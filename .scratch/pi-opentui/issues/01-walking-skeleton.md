# 01: Walking skeleton

**What to build:** Running `piu` in a project folder opens the new interface, starts the Backend (`pi --mode rpc` by default) with every user argument passed through, and shows the default two-column Layout. The agent Panel shows my prompt and the assistant's reply streaming as plain text. Pressing Enter in the input sends the prompt. Chat and input are built-in Extensions on a minimal Module contract (reactive Pi state, actions, cleanup), and their colors come from theme tokens (one default theme). This ticket also sets up the repo (Bun, pnpm, `tsc`, Biome, `bun test`) and the primary test seam the spec describes: the app in OpenTUI's test renderer against a real, isolated `pi --mode rpc` with the faux model from `pi-ai`.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [x] `pnpm` install, `tsc`, Biome check and `bun test` all pass from a clean checkout
- [x] A test boots the app in the test renderer against the real pinned `pi --mode rpc` (isolated via `PI_CODING_AGENT_DIR`, `PI_OFFLINE=1`, `--no-session`) with a scripted faux reply, types a prompt, presses Enter, and the frame shows the prompt and the full scripted reply
- [x] A test shows the reply growing across frames while it streams (several faux chunks)
- [x] A test confirms user arguments after `piu` reach the Backend (e.g. `--model` picks the faux model shown in state)
- [x] The first column takes about 66% and the second about 33% of a wide terminal in the frame
- [x] Chat and input are discovered as built-in Extensions and placed through the default config's Placement, not hard-wired
- [x] Modules use theme tokens only, with no literal colors in Module code
- [x] `piu` is runnable as a command (package bin), and the local machine has a link to it
