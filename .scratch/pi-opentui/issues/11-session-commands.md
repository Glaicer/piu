# 11: Session commands

**What to build:** The app's own replacements for Pi's TUI-only commands. New session starts a fresh conversation. Resume opens a Modal listing sessions and switches to the chosen one. Tree opens a Modal of the session tree, and picking an entry forks from it. Compact shrinks the context. All are reachable from `/` autocomplete.

**Blocked by:** 09, 10

**Status:** ready-for-agent

- [ ] New session clears the agent Panel, and the next prompt starts a new session in Backend state
- [ ] With two sessions in the isolated Pi dir (sessions enabled for this test), Resume lists both and switching shows the other's messages
- [ ] Tree shows the entries of a branched session, and forking from an earlier entry shows the conversation up to that entry
- [ ] Compact triggers compaction and shows its service row

## Comments

- From 01: the spec wants one Backend per test file, reset between tests with `new_session`. Until now every test boots its own app and Backend (about 0.4 s each). Once New session exists, the harness can share one app per file and reset through it.
- From 06: there is no highlight cache. A remounted message highlights its code again, so Tree and Resume, which re-render whole histories, pay for every code block each time. Watch that cost; the way in is noted in 06's comments (build `MarkdownRenderable` imperatively with a `treeSitterClient`).
- From 07: the Pi state store does not reload `get_messages` after `compaction_end`, so service rows can be anchored to messages Pi has compacted away. A failed attempt that Pi drops on retry stays in the message list (it renders nothing). Compactions and retries from before a resume get no row. The Compact command should leave the message list matching Pi's.
