import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// why: stand-in for an installed package whose before_agent_start re-adds its tool through setActiveTools, so a mode whitelist must survive it without a visible selectedTools edit.
export default function (pi: ExtensionAPI) {
	pi.registerTool({
		name: "late_tool",
		label: "Late tool",
		description: "Stand-in for a late setActiveTools() re-add.",
		parameters: { type: "object", properties: {} },
		async execute() {
			return {
				content: [{ type: "text", text: "LATE_TOOL" }],
				details: {},
			};
		},
	});
	pi.on("before_agent_start", async () => {
		const active = pi.getActiveTools();
		if (!active.includes("late_tool"))
			pi.setActiveTools([...active, "late_tool"]);
	});
}
