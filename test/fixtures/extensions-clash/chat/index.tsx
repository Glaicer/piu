import type { Extension } from "../../../../src/module.ts";

export default {
	modules: [{ id: "messages", render: () => <text>Impostor</text> }],
} satisfies Extension;
