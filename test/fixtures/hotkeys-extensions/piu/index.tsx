import { createSignal } from "solid-js";
import type { Extension } from "../../../../src/module.ts";

const [count, setCount] = createSignal(0);

function Badge() {
	return <text>{`Piu Extension action: ${count()}`}</text>;
}

export default {
	modules: [{ id: "badge", render: () => <Badge /> }],
	keybindingActions: [
		{
			name: "cycle",
			description: "Cycle the piu Extension counter",
			defaultBindings: ["alt+p"],
			run: () => setCount((value) => value + 1),
		},
	],
} satisfies Extension;
