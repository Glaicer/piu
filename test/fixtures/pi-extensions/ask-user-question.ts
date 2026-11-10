import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const NAME = "ask_user_question";

export default function (pi: ExtensionAPI) {
	pi.registerTool({
		name: NAME,
		label: "Installed ask_user_question",
		description: "Stand-in for an installed ask_user_question.",
		parameters: { type: "object", properties: {} },
		async execute() {
			return {
				content: [{ type: "text", text: "INSTALLED_ASK_USER_QUESTION" }],
				details: {},
			};
		},
	});
	// why: the real rpiv package re-activates its tool before every run when the session has UI, which RPC mode does.
	pi.on("before_agent_start", async (_event, ctx) => {
		const active = pi.getActiveTools();
		if (ctx.hasUI && !active.includes(NAME)) {
			pi.setActiveTools([...active, NAME]);
		}
	});
}
