# 18: Config strictness

**What to build:** A typo in `config.json` never turns into a silent default or a blank screen (spec stories 29 and 30). An unknown key at any level of the merged config is a startup error naming its field path. A config that places no Module at all is a startup error, since an empty frame is never what the user meant; a single empty Panel, like column 2 in the default Layout, stays valid. An Extension folder whose name contains a dot can't be addressed as `<extension>.<module>`, so discovery rejects it at startup with its path.

**Blocked by:** 03, 15

**Status:** ready-for-agent

- [ ] A fixture `config.json` with a misspelled top-level key (`palcement`) fails startup with that key's path in the message
- [ ] A misspelled nested key (inside `backend` or a Layout Slot) fails startup with its full path
- [ ] A fixture that replaces `layout` with Panel ids the default Placement doesn't cover, and writes no `placement`, fails startup with a message saying no Module is placed
- [ ] The default config, whose column 2 Panel is empty, still starts
- [ ] An Extension folder named with a dot in `extensions/` fails startup with its path
- [ ] A `keybindings` key name OpenTUI never reports (`"esc"`, `"ctrl+enter"`; OpenTUI says `escape` and `return`) fails startup naming `keybindings.<action>`

## Comments

- From 03: unknown keys are ignored today, and replacing `layout` without `placement` gives a blank frame with no warning.
- Known sections are those listed in the spec (`backend`, `layout`, `placement`, `modules`, `keybindings`, `theme`, `animations`). Sections whose schema doesn't exist yet only need their top-level key accepted here; tickets 15, 16 and 17 make their own contents strict. Touches `src/config.ts` like 04, so do them one after the other.
- From 15: two `keybindings` actions bound to the same key are not rejected (the first in table order wins), and a `command.<name>` key for a command whose Extension is not placed is silently accepted when `<name>` is a default action.
- From 15: key names are only parsed (`[ctrl+][shift+][alt+]name`), not checked against the names OpenTUI emits, so a misspelled key is accepted and never matches.
