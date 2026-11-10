# 10: `/` and `@` autocomplete

**What to build:** Typing `/` in the input opens autocomplete over the Backend's commands (`get_commands`: extension commands, prompt templates, skills) merged with the app's own command registry. Choosing an entry inserts it, and running an app command executes it instead of sending it to the model. Typing `@` autocompletes file paths in the working folder.

**Blocked by:** 08

**Status:** ready-for-agent

- [ ] With a test prompt template and a test extension command in the isolated Pi dir, `/` lists both plus a registered app command
- [ ] Typing narrows the list, and Enter inserts the chosen entry
- [ ] An app command runs locally and doesn't reach the model, while a prompt template expands and reaches the model
- [ ] `@` lists files of a fixture folder, narrows as I type, and inserts the chosen path
