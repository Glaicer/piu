import type { Extension } from "../../../../src/module.ts";

export default {
	modules: [{ id: "thing", render: () => <text>Dotted</text> }],
} satisfies Extension;
