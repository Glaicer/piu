import { join } from "node:path";
import { render } from "@opentui/solid";
import { createApp } from "./app.tsx";
import { StartupError } from "./startup-error.ts";

const view = await createApp({
	configPath: join(import.meta.dir, "../config.json"),
	extensionsDir: join(import.meta.dir, "../extensions"),
	args: process.argv.slice(2),
}).catch((error) => {
	if (!(error instanceof StartupError)) throw error;
	console.error(error.message);
	process.exit(1);
});
await render(view, { exitOnCtrlC: true });
