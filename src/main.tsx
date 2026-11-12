import { writeFileSync } from "node:fs";
import { render } from "@opentui/solid";
import { createApp } from "./app.tsx";
import { HANDOFF_ENV, RESTART_EXIT_CODE } from "./restart.ts";
import { StartupError } from "./startup-error.ts";

const view = await createApp({
	args: process.argv.slice(2),
	notice: (message) => console.error(`piu: ${message}`),
	exit: ({ restartArgs }) => {
		const handoff = process.env[HANDOFF_ENV];
		if (!restartArgs) process.exit(0);
		if (!handoff) {
			console.error(
				"piu: restart needs the launcher, start piu with bin/piu.ts",
			);
			process.exit(1);
		}
		writeFileSync(handoff, JSON.stringify(restartArgs));
		process.exit(RESTART_EXIT_CODE);
	},
}).catch((error) => {
	if (!(error instanceof StartupError)) throw error;
	console.error(error.message);
	process.exit(1);
});
await render(view, { exitOnCtrlC: true });
