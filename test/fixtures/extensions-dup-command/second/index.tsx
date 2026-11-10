import type { Extension } from "../../../../src/module.ts";

export default {
	modules: [{ id: "tag", render: () => <text>second</text> }],
	commands: [{ name: "twice", run: () => {} }],
} satisfies Extension;
