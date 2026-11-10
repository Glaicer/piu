import { readFileSync } from "node:fs";
import {
	fauxAssistantMessage,
	fauxProvider,
	fauxText,
} from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { FauxScript } from "../harness.ts";

export default function (pi: ExtensionAPI) {
	const scriptPath = process.env.PIU_FAUX_SCRIPT;
	if (!scriptPath) throw new Error("PIU_FAUX_SCRIPT is not set");
	const script: FauxScript = JSON.parse(readFileSync(scriptPath, "utf8"));
	const faux = fauxProvider({
		provider: "faux",
		models: [{ id: "faux-1" }, { id: "faux-2" }],
		tokensPerSecond: script.tokensPerSecond,
		tokenSize: script.tokenSize
			? { min: script.tokenSize, max: script.tokenSize }
			: undefined,
	});
	faux.setResponses(
		script.replies.map(
			(reply) => (context, _options, _state, model) =>
				fauxAssistantMessage(
					fauxText(
						reply
							.replaceAll("{model}", model.id)
							.replaceAll(
								"{messages}",
								String(
									context.messages.filter(
										(message) =>
											message.role === "user" || message.role === "assistant",
									).length,
								),
							),
					),
				),
		),
	);
	pi.registerProvider(faux.provider);
	if (script.crash) {
		const { code, stderr } = script.crash;
		pi.registerCommand("crash", {
			handler: async () => {
				process.stderr.write(stderr);
				process.exit(code);
			},
		});
	}
}
