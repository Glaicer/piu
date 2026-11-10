import { render } from "@opentui/solid";
import { createApp } from "./app.tsx";
import { defaultConfig } from "./config.ts";

const view = await createApp({
	config: defaultConfig,
	args: process.argv.slice(2),
});
await render(view, { exitOnCtrlC: true });
