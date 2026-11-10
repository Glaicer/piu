import { For } from "solid-js";
import type { Extension } from "../../../../src/module.ts";

function Lines(props: { prefix: string }) {
	const numbers = Array.from({ length: 40 }, (_, index) =>
		String(index + 1).padStart(2, "0"),
	);
	return (
		<For each={numbers}>{(n) => <text>{`${props.prefix} ${n}`}</text>}</For>
	);
}

export default {
	modules: [
		{ id: "alpha", render: () => <Lines prefix="alpha" /> },
		{ id: "beta", render: () => <Lines prefix="beta" /> },
	],
} satisfies Extension;
