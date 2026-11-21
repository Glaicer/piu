# Write Settings changes into the personal Config

Settings applies Global changes in memory immediately and persists each change to `$PIU_HOME/config.json` (`~/.piu/config.json` by default). Before saving, reread the file and patch only the affected key, including just `mode` inside `theme`. If the file is missing, start with an empty object rather than materializing defaults. Write indented JSON to a sibling temporary file, then rename it over the destination.

Keybinding changes patch only `keybindings.<action>`. For an assignment, resolve conflicts against the personal layer read from the file and move the action's key to the end only if the new shortcut would otherwise lose. Before accepting a confirmation, reread the layer and recompute the warning if it changed. Use the same file snapshot for the conflict decision and the write, so external edits to other action keys take effect both now and after Restart. Removing a shortcut or clearing the list keeps the action's place, and resetting removes the key.

The Extensions tab keeps a draft until Save. Interface changes patch the personal Config's `extensions` object. Disabling leaves Placement alone; enabling removes the override. Deleting a personal Extension removes its references from Config before deleting its folder, so Restart does not encounter dangling references.

Agentic edits target the global `settings.json` in the configured Backend's agent dir. Pi's `FileSettingsStorage` uses `proper-lockfile` with `realpath: false`: both writers claim the same sibling `settings.json.lock` directory. Piu acquires it before reading and holds it through atomic replacement. If Pi already holds it, Save reports the conflict and keeps the unsaved edit available for retry. Package removal uses the Backend's `remove` command, which manages its own settings lock. Project Pi settings and CLI overrides are not edited.

## Considered options

- **Write the merged startup Config**: simpler, but this would overwrite edits made since startup and pin defaults that should still follow future releases.
- **Keep Settings in a separate file**: avoids rewriting Config, but introduces a second source of truth for values users already set in Config.

## Consequences

- Other keys and edits completed before the save's read are preserved. Atomic replacement prevents partial JSON, but it does not serialize concurrent writers.
- If the file cannot be parsed or written, leave it alone and show an error Toast. The new value remains active in memory until Restart.
- Saving Extensions is not a transaction across Config, Pi settings and filesystem/package removal. If a later edit fails, completed edits are kept and the remaining edits stay in the draft. The running app and Backend are unchanged until Restart.
