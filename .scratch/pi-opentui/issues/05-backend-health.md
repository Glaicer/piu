# 05: Backend health

**What to build:** The app survives Backend problems. If the configured Backend command isn't found, the screen shows a message naming the config key to change. If the Backend exits, the agent Panel shows an error card with the exit code and the last stderr lines plus a Restart button. Restart starts the Backend again with `-c` so the same session continues, and the conversation is visible again.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] With `backend.command` set to a missing program, the frame shows the not-found message mentioning `backend.command`, and the app doesn't exit
- [ ] When the faux test Pi extension exits the Backend on cue, the frame shows the error card with its stderr tail
- [ ] Clicking Restart (mock mouse) brings the Backend back with `-c`, and the earlier messages of that session reappear
- [ ] Prompting after restart works

## Comments

- From 01: `Backend.stop()` in `src/backend.ts` only ends the child's stdin (Pi's documented orderly shutdown) and never kills it. Confirm `pi-bolt` exits on stdin EOF (see 02), and decide whether a kill fallback is needed.
- From 01: the input Module calls `void actions.prompt(...)`, so a prompt sent to a dead Backend is an unhandled rejection. Backend health should own that failure.
- From 01: the Backend client already keeps a 64 KB stderr tail (`stderrTail()`) for the error card.
