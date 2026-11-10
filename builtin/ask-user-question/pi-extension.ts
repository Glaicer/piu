import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
	CHANNEL_TITLE,
	type Question,
	type Reply,
	type Request,
} from "./protocol.ts";

const REPLACED_TOOL = "ask_user_question";

const option = {
	type: "object",
	properties: {
		label: { type: "string", description: "Short option text (1-5 words)" },
		description: { type: "string", description: "What this option means" },
	},
	required: ["label"],
};

const question = {
	type: "object",
	properties: {
		question: { type: "string", description: "The full question" },
		header: { type: "string", description: "Short tab label (max 12 chars)" },
		options: { type: "array", items: option, minItems: 2, maxItems: 4 },
		multiSelect: {
			type: "boolean",
			description: "Allow choosing more than one option",
		},
	},
	required: ["question", "header", "options"],
};

function answerText(answer: readonly string[] | undefined) {
	return answer?.length ? `"${answer.join(", ")}"` : "(not answered)";
}

function resultText(questions: readonly Question[], reply: Reply | undefined) {
	if (!reply) return "The user declined to answer the questions.";
	return questions
		.map((q, index) => `"${q.question}" = ${answerText(reply.answers[index])}`)
		.join("\n");
}

export default function (pi: ExtensionAPI) {
	// why: a duplicate name stops Pi-Bolt, and setActiveTools() is undone by the installed package (ADR-0001).
	pi.on("before_agent_start", async (event) => {
		const tools = event.systemPromptOptions.selectedTools;
		const at = tools.indexOf(REPLACED_TOOL);
		if (at >= 0) tools.splice(at, 1);
	});
	pi.registerTool({
		name: "ask_user",
		label: "Ask user",
		description:
			"Ask the user 1-4 multiple-choice questions and wait for the answers. Use it when a decision or preference only the user can give blocks the work.",
		parameters: {
			type: "object",
			properties: {
				questions: { type: "array", items: question, minItems: 1, maxItems: 4 },
			},
			required: ["questions"],
		},
		async execute(_id, args, _signal, _onUpdate, ctx) {
			const { questions } = args as { questions: Question[] };
			const answer = await ctx.ui.editor(
				CHANNEL_TITLE,
				JSON.stringify({ v: 1, questions } satisfies Request),
			);
			const reply = answer === undefined ? undefined : JSON.parse(answer);
			return {
				content: [{ type: "text", text: resultText(questions, reply) }],
				details: {},
			};
		},
	});
}
