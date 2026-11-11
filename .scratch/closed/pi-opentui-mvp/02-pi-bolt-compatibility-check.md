# 02: Pi-Bolt compatibility check

**What to build:** A manual script, outside the regular suite, that answers the two open risks in ADR-0001 on a machine with Pi-Bolt. (a) Does a tool registered by an `-e` Pi extension win over Pi-Bolt's compiled-in tool of the same name (`ask_user_question`)? (b) Do Pi-Bolt's compiled-in Pi extensions that use Pi's own TUI API behave in `--mode rpc` (no crash, no protocol noise on stdout)? The findings are written back into ADR-0001.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] Running the script against `pi-bolt --mode rpc` with a tiny `-e` Pi extension that registers `ask_user_question` reports which implementation the model call reaches
- [x] The script reports any non-protocol output on stdout and any startup errors from compiled-in Pi extensions
- [x] ADR-0001's Consequences say what was verified, and the workaround if precedence fails (e.g. how to exclude the compiled-in one for `piu`)
- [x] The script skips with a clear message when `pi-bolt` is not installed

## Comments

- From 01: also check that `pi-bolt --mode rpc` exits when its stdin closes. `Backend.stop()` relies on that and sends no signal.
