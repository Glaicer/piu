# 17: Theme: light/dark and overrides

**What to build:** Built-in light and dark themes over the semantic tokens (text, muted, accent, success, warning, error, surface, border), chosen to match the terminal background. Any token can be overridden in `config.json`.

**Blocked by:** 03

**Status:** ready-for-agent

- [ ] With the test terminal reporting a dark background the dark token values are used, and with a light one the light values
- [ ] An `accent` override in a fixture `config.json` changes the accent color in the frame
- [ ] An unknown token name in config is a startup error with the field path
