# 11: Session commands

**What to build:** The app's own replacements for Pi's TUI-only commands. New session starts a fresh conversation. Resume opens a Modal listing sessions and switches to the chosen one. Tree opens a Modal of the session tree, and picking an entry forks from it. Compact shrinks the context. All are reachable from `/` autocomplete.

**Blocked by:** 09, 10

**Status:** ready-for-agent

- [ ] New session clears the agent Panel, and the next prompt starts a new session in Backend state
- [ ] With two sessions in the isolated Pi dir (sessions enabled for this test), Resume lists both and switching shows the other's messages
- [ ] Tree shows the entries of a branched session, and forking from an earlier entry shows the conversation up to that entry
- [ ] Compact triggers compaction and shows its service row
