import { createSignal, For } from "solid-js";
import type { Extension } from "../../../../src/module.ts";

globalThis.piuTestHooks.loaded.push("hotkeys-a");

const [count, setCount] = createSignal(0);

function Badge() {
	return <text>{`A action: ${count()}`}</text>;
}

function Tall() {
	return (
		<For each={Array.from({ length: 40 }, (_, index) => `Tall ${index}`)}>
			{(line) => <text>{line}</text>}
		</For>
	);
}

export default {
	modules: [
		{ id: "badge", render: () => <Badge /> },
		{ id: "tall", render: () => <Tall /> },
	],
	keybindingActions: [
		{
			name: "cycle",
			description: "Cycle the A counter",
			defaultBindings: ["alt+m"],
			run: () => setCount((value) => value + 1),
		},
	],
} satisfies Extension;
