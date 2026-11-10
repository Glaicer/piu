import type { BackendConfig } from "./backend.ts";
import type { Slot } from "./layout.tsx";

export type Placement = Readonly<Record<string, readonly string[]>>;

export type Config = {
	backend: BackendConfig;
	layout: Slot;
	placement: Placement;
};

export const defaultConfig: Config = {
	backend: { command: "pi", args: [] },
	layout: {
		kind: "container",
		id: "root",
		direction: "row",
		size: "rest",
		children: [
			{
				kind: "container",
				id: "main",
				direction: "column",
				size: "rest",
				children: [
					{ kind: "panel", id: "agent", direction: "column", size: "rest" },
					{ kind: "panel", id: "input", direction: "column", size: 3 },
				],
			},
			{ kind: "panel", id: "side", direction: "column", size: "33%" },
		],
	},
	placement: {
		agent: ["chat.messages"],
		input: ["input.prompt"],
		side: [],
	},
};
