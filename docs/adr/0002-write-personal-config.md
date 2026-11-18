# Write Settings changes into the personal Config

Settings applies Global changes in memory immediately and persists each change to `$PIU_HOME/config.json` (`~/.piu/config.json` by default). Before saving, reread the file and patch only the affected key, including just `mode` inside `theme`. If the file is missing, start with an empty object rather than materializing defaults. Write indented JSON to a sibling temporary file, then rename it over the destination.

## Considered options

- **Write the merged startup Config**: simpler, but this would overwrite edits made since startup and pin defaults that should still follow future releases.
- **Keep Settings in a separate file**: avoids rewriting Config, but introduces a second source of truth for values users already set in Config.

## Consequences

- Other keys and edits completed before the save's read are preserved. Atomic replacement prevents partial JSON, but it does not serialize concurrent writers.
- If the file cannot be parsed or written, leave it alone and show an error Toast. The new value remains active in memory until Restart.
- This decision applies to piu's Config, not Pi settings.
