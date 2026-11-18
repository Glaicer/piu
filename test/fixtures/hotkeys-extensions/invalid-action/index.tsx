import type { Extension } from "../../../../src/module.ts";

export default {
	modules: [{ id: "badge", render: () => <text>Invalid action</text> }],
	keybindingActions: [null],
} as unknown as Extension;
