import { createSignal } from "solid-js";
import type { Extension } from "../../../../src/module.ts";

function Counter() {
	const [count, setCount] = createSignal(0);
	return (
		<box onMouseDown={() => setCount(count() + 1)}>
			<text>{`Count ${count()}`}</text>
		</box>
	);
}

export default {
	modules: [{ id: "count", render: () => <Counter /> }],
} satisfies Extension;
