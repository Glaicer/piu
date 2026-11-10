import type { Extension } from "../../../../src/module.ts";

export default {
	modules: [{ id: "tag", render: () => <text>first</text> }],
	commands: [{ name: "twice", run: () => {} }],
} satisfies Extension;
