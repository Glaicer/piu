import { readFileSync } from "node:fs";
import {
	type FauxContentBlock,
	fauxAssistantMessage,
	fauxProvider,
	fauxText,
	fauxThinking,
	fauxToolCall,
	type Message,
} from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { FauxScript, FauxStep } from "../harness.ts";

export default function (pi: ExtensionAPI) {
	const scriptPath = process.env.PIU_FAUX_SCRIPT;
	if (!scriptPath) throw new Error("PIU_FAUX_SCRIPT is not set");
	const script: FauxScript = JSON.parse(readFileSync(scriptPath, "utf8"));
	const faux = fauxProvider({
		provider: "faux",
		models: [{ id: "faux-1" }, { id: "faux-2", reasoning: true }],
		tokensPerSecond: script.tokensPerSecond,
		tokenSize: script.tokenSize
			? { min: script.tokenSize, max: script.tokenSize }
			: undefined,
	});
	const lastUser = (context: { messages: Message[] }) => {
		const message = context.messages.findLast((m) => m.role === "user");
		const content = message?.content ?? "";
		return JSON.stringify(
			typeof content === "string"
				? content
				: content
						.map((block) => (block.type === "text" ? block.text : ""))
						.join(""),
		);
	};
	const substitute = (
		text: string,
		context: { messages: Message[] },
		modelId: string,
	) =>
		text
			.replaceAll("{model}", modelId)
			.replaceAll("{lastUser}", lastUser(context))
			.replaceAll(
				"{messages}",
				String(
					context.messages.filter(
						(message) =>
							message.role === "user" || message.role === "assistant",
					).length,
				),
			);
	faux.setResponses(
		script.replies.map((reply) => (context, _options, _state, model) => {
			const step: FauxStep =
				typeof reply === "string" ? { text: reply } : reply;
			const blocks: FauxContentBlock[] = [];
			if (step.thinking) blocks.push(fauxThinking(step.thinking));
			if (step.text)
				blocks.push(fauxText(substitute(step.text, context, model.id)));
			for (const call of step.toolCalls ?? [])
				blocks.push(fauxToolCall(call.name, call.args));
			return step.error
				? fauxAssistantMessage(blocks, {
						stopReason: "error",
						errorMessage: step.error,
					})
				: fauxAssistantMessage(blocks);
		}),
	);
	pi.registerProvider(faux.provider);
	if (script.compactCommand) {
		pi.registerCommand("compact-now", {
			handler: async (_args, ctx) => {
				ctx.compact();
			},
		});
	}
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
