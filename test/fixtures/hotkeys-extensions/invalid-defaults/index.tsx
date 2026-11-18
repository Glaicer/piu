import { createSignal } from "solid-js";
import type { Extension } from "../../../../src/module.ts";

// why: a hole must be a startup error, not a TypeError when the registry walks the defaults.
const defaultBindings: string[] = [];
defaultBindings[1] = "alt+m";
let readDefaults = false;

const [, setCount] = createSignal(0);

export default {
	modules: [{ id: "badge", render: () => <text>Invalid defaults</text> }],
	keybindingActions: [
		{
			name: "cycle",
			description: "Cycle the invalid defaults",
			get defaultBindings() {
				if (readDefaults) return ["alt+m"];
				readDefaults = true;
				return defaultBindings;
			},
			run: () => setCount((value) => value + 1),
		},
	],
} satisfies Extension;
