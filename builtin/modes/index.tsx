import type { CommandContext, Extension } from "../../src/module.ts";
import { MODE_NEXT_PROMPT } from "./protocol.ts";

export function nextMode({ actions }: CommandContext) {
	void actions.prompt(MODE_NEXT_PROMPT);
}

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
			run: nextMode,
		},
	],
} satisfies Extension;
