import type { Command } from "./module.ts";

const quit = (name: string): Command => ({
	name,
	description: "Close the Backend and piu",
	takesArguments: false,
	run: ({ actions }) => actions.quit(),
});

export const lifecycleCommands: readonly Command[] = [
	{
		name: "update",
		description: "Update the configured Backend",
		takesArguments: false,
		run: ({ actions }) => actions.updateBackend(),
	},
	{
		name: "restart",
		description: "Restart the Backend and piu, keeping this session",
		takesArguments: false,
		run: ({ actions }) => actions.restart(),
	},
	quit("q"),
	quit("quit"),
	quit("exit"),
];
