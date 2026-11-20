import type { Extension } from "../../src/module.ts";
import { MODE_NEXT_PROMPT } from "./protocol.ts";

export default {
	modules: [
		{
			id: "bridge",
			render: (context) => {
				context.reportPresence(() => "hidden");
				return null;
			},
		},
	],
	keybindingActions: [
		{
			name: "next",
			description: "Next agent mode",
			defaultBindings: ["alt+m"],
			run: (context) => {
				void context.actions.prompt(MODE_NEXT_PROMPT);
			},
		},
	],
} satisfies Extension;
