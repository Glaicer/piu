import type { Extension } from "../../../../src/module.ts";

globalThis.piuTestHooks.loaded.push("lazy");

export default {
	modules: [{ id: "idle", render: () => <text>Idle</text> }],
} satisfies Extension;
