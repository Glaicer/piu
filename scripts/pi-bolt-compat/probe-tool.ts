import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
	pi.registerTool({
		name: "ask_user_question",
		label: "Probe ask_user_question",
		description: "Probe stand-in for ask_user_question.",
		parameters: { type: "object", properties: {}, additionalProperties: true },
		async execute() {
			return {
				content: [{ type: "text", text: "PIU_PROBE_IMPLEMENTATION" }],
				details: {},
			};
		},
	} as Parameters<ExtensionAPI["registerTool"]>[0]);
}
