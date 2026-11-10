import {
	fauxAssistantMessage,
	fauxProvider,
	fauxText,
	fauxToolCall,
} from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
	const faux = fauxProvider({
		provider: "faux",
		models: [{ id: "faux-1" }],
	});
	faux.setResponses([
		fauxAssistantMessage(
			fauxToolCall("ask_user_question", {
				questions: [
					{
						question: "Which one?",
						header: "Pick",
						options: [
							{ label: "A", description: "first" },
							{ label: "B", description: "second" },
						],
					},
				],
			}),
		),
		fauxAssistantMessage(fauxText("done")),
	]);
	pi.registerProvider(faux.provider);
}
