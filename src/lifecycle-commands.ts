import type { Command } from "./module.ts";

type LifecycleCommand = Command & { readonly aliases?: readonly string[] };

export const lifecycleCommands: readonly LifecycleCommand[] = [
	{
		name: "settings",
		description: "Open piu settings",
		takesArguments: false,
		run: ({ actions }) => actions.openSettings(),
	},
	{
		name: "hotkeys",
		description: "Open keyboard shortcuts in piu settings",
		takesArguments: false,
		run: ({ actions }) => actions.openSettings("hotkeys"),
	},
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
	{
		name: "quit",
		aliases: ["q", "exit"],
		description: "Close the Backend and piu",
		takesArguments: false,
		run: ({ actions }) => actions.quit(),
	},
];

export const lifecycleCommandAliases = new Map(
	lifecycleCommands.flatMap(({ name, aliases }) =>
		(aliases ?? []).map((alias) => [alias, name] as const),
	),
);
