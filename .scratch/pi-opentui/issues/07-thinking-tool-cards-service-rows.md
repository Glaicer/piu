# 07: Thinking, tool cards and service rows

**What to build:** Thinking blocks appear collapsed by default with a one-line label, and a click expands them. Each tool call is a card showing the tool name, its key argument, its status (running, done, error) and its duration, and a click expands its arguments and result. Compaction and automatic retries appear as one-line service rows.

**Blocked by:** 01

**Status:** done

- [x] A scripted reply with thinking shows only the collapsed label, and clicking it shows the thinking text
- [x] A scripted tool call (e.g. `read`) shows a card with name, key argument and a running status that changes to done with a duration
- [x] Clicking the card shows the result text, and clicking again hides it
- [x] A failing tool call shows an error status
- [x] A triggered compaction and a scripted retry each show a service row

## Comments

Deviations from the ticket and decisions worth knowing:

- A tool card is `running` while no `toolResult` message with its `toolCallId` exists, then `done` or `error` from that message's `isError`, with the duration from its `durationMs`. The Pi state store ignores `tool_execution_*` events, so a session loaded with `-c` shows the same cards (the duration appears when Pi recorded one).
- Service rows live in `PiState.serviceRows`, each anchored to the number of messages at the time it arrived, so it renders between the messages around it. They are cleared on Restart, and Pi's `summarization_retry_*` events (retries of the compaction call itself) are not shown. Both are left for later.
- Compaction and retry rows are updated in place from "active" to "ok" or "failed". Only compaction started through an Extension command is tested (`/compact-now` in the faux Pi extension); the app has no compact action until ticket 11.
- Expand and collapse jump with no animation; ticket 16 adds it.
- `isFormatted` in `test/chat.test.ts` now also waits for the list items and the code line. It returned while the list text was still being drawn, which flaked about 1 run in 40 before and more often after this ticket.
- A tool call in an assistant message that ended with `stopReason` `error` or `aborted` never gets a `toolResult` (Pi skips the tools), so its card shows `error` instead of `running` forever.
- The harness writes the agent dir's `settings.json` for every test, not only the ones that retry or compact; it changes nothing else.
- Known gaps, left for later tickets: a failed attempt that Pi drops on retry stays in the message list (it renders nothing), the store does not reload `get_messages` after `compaction_end`, so rows can be anchored to messages Pi has since compacted away, and compactions or retries from before a resume get no row.
