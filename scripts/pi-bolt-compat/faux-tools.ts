import {
	fauxAssistantMessage,
	fauxProvider,
	fauxText,
	fauxToolCall,
	getCurrentTools,
} from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export const TOOLS_PREFIX = "Offered tools: ";

export default function (pi: ExtensionAPI) {
	const faux = fauxProvider({
		provider: "faux",
		models: [{ id: "faux-1" }],
	});
	// why: the second request, after a tool result, shows whether a replaced tool returns mid-run.
	faux.setResponses([
		fauxAssistantMessage(fauxToolCall("bash", { command: "true" })),
		(context) =>
			fauxAssistantMessage(
				fauxText(
					TOOLS_PREFIX +
						getCurrentTools(context.messages)
							.map((tool) => tool.name)
							.join(","),
				),
			),
	]);
	pi.registerProvider(faux.provider);
}
