import { render } from "@opentui/solid";
import { createApp } from "./app.tsx";
import { StartupError } from "./startup-error.ts";

const view = await createApp({
	args: process.argv.slice(2),
}).catch((error) => {
	if (!(error instanceof StartupError)) throw error;
	console.error(error.message);
	process.exit(1);
});
await render(view, { exitOnCtrlC: true });
