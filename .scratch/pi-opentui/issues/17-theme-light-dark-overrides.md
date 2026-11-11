# 17: Theme: light/dark and overrides

**What to build:** Built-in light and dark themes over the semantic tokens (text, muted, accent, success, warning, error, surface, border), chosen to match the terminal background. Any token can be overridden in `config.json`.

**Blocked by:** 03

**Status:** done

- [x] With the test terminal reporting a dark background the dark token values are used, and with a light one the light values
- [x] An `accent` override in a fixture `config.json` changes the accent color in the frame
- [x] An unknown token name in config is a startup error with the field path

## Comments

- Light or dark comes from `renderer.themeMode`, which the renderer infers from the terminal's OSC 11 background reply. The reply arrives after the first render, so the theme is a Solid store that follows the `theme_mode` event; until a reply arrives (or if the terminal never answers) the dark theme is used. Tests report a background with `startPiu({ terminalBackground })` or `reportTerminalBackground(mode)`.
- One `theme` override set applies to whichever built-in theme is active; there is no separate `theme.light` / `theme.dark`.
- Override values must be `#rrggbb`. OpenTUI turns an unparsable color into magenta with only a console warning, so config rejects them at startup (`theme.<token>` in the message).
- `defaultTheme` is now `darkTheme`; the light values are new (`lightTheme`, Tokyo Night Day-like) and were not checked on a real light terminal.
