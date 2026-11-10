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
	if (script.branchBackCommand) {
		// why: Pi's RPC has no way to branch inside one session; only an extension can navigate the tree back to the first reply, and sending the next prompt from the same handler keeps the test free of timing.
		pi.registerCommand("branch-back", {
			handler: async (args, ctx) => {
				await ctx.waitForIdle();
				const reply = ctx.sessionManager
					.getEntries()
					.find(
						(entry) =>
							entry.type === "message" && entry.message.role === "assistant",
					);
				if (reply) await ctx.navigateTree(reply.id);
				pi.sendUserMessage(args);
			},
		});
	}
	for (const name of script.extensionCommands ?? []) {
		pi.registerCommand(name, {
			description: `Extension command ${name}`,
			handler: async () => {},
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
