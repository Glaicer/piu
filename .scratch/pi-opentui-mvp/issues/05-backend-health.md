# 05: Backend health

**What to build:** The app survives Backend problems. If the configured Backend command isn't found, the screen shows a message naming the config key to change. If the Backend exits, the agent Panel shows an error card with the exit code and the last stderr lines plus a Restart button. Restart starts the Backend again with `-c` so the same session continues, and the conversation is visible again.

**Blocked by:** 01

**Status:** done

- [x] With `backend.command` set to a missing program, the frame shows the not-found message mentioning `backend.command`, and the app doesn't exit
- [x] When the faux test Pi extension exits the Backend on cue, the frame shows the error card with its stderr tail
- [x] When the Backend dies at startup before answering any command (e.g. a test Pi extension that throws on load), the frame shows the error card with its stderr, not a hang
- [x] Clicking Restart (mock mouse) brings the Backend back with `-c`, and the earlier messages of that session reappear
- [x] Prompting after restart works

## Comments

- From 01: `Backend.stop()` in `src/backend.ts` only ends the child's stdin (Pi's documented orderly shutdown) and never kills it. Confirm `pi-bolt` exits on stdin EOF (see 02), and decide whether a kill fallback is needed.
- From 01: the input Module calls `void actions.prompt(...)`, so a prompt sent to a dead Backend is an unhandled rejection. Backend health should own that failure.
- From 01: the Backend client already keeps a 64 KB stderr tail (`stderrTail()`) for the error card.
- From 02: `pi-bolt --mode rpc` exits (code 0, ~10 ms) when stdin closes while idle; closing it mid-run is not checked. A tool-name conflict between an `-e` Pi extension and a Pi-Bolt package makes the Backend exit with code 1 before answering any command, with `Tool "<name>" conflicts with <file>` on stderr. The error card should show `stderrTail()` for that case.
- From 05: no kill fallback in `Backend.stop()`: stock `pi` and `pi-bolt` both exit on stdin EOF in the middle of a streaming reply (numbers in ADR-0001). A hung tool call was not tried.
- From 05: the error card and the not-found message are rendered by the `chat.messages` Module, so they follow the chat wherever the Placement puts it. The not-found message has no Restart button: the config is read once at launch, so a fix needs a new `piu`.
- From 05: every Backend start, not only Restart, loads the conversation with `get_messages`, so `piu -c` now shows the continued session. Restart passes `-c` before the user's own arguments.
- From 05: the card has no keyboard path to Restart; ticket 15 owns focus and keybindings.
