import { createEffect, createMemo } from "solid-js";
import type { ChannelPayload } from "../../src/channel.ts";
import type { Extension, ModuleContext } from "../../src/module.ts";
import { Card } from "./card.tsx";
import { CHANNEL, type Question } from "./protocol.ts";

type Pending = {
	readonly id: string;
	readonly questions: readonly Question[] | undefined;
};

const isOption = (option: unknown) =>
	typeof option === "object" &&
	option !== null &&
	"label" in option &&
	typeof option.label === "string";

const isQuestion = (value: unknown): value is Question => {
	if (typeof value !== "object" || value === null) return false;
	const { question, header, options, multiSelect } = value as Partial<Question>;
	return (
		typeof question === "string" &&
		typeof header === "string" &&
		Array.isArray(options) &&
		options.every(isOption) &&
		(multiSelect === undefined || typeof multiSelect === "boolean")
	);
};

function parseQuestions(payload: ChannelPayload) {
	const { questions } = payload;
	if (
		Array.isArray(questions) &&
		questions.length > 0 &&
		questions.every(isQuestion)
	) {
		return questions;
	}
}

function QuestionSlot(props: { context: ModuleContext }) {
	const { context } = props;
	const pending = createMemo(
		(): Pending | undefined => {
			const request = context.channel.requests.find(
				(r) => r.channel === CHANNEL,
			);
			return (
				request && {
					id: request.id,
					questions: parseQuestions(request.payload),
				}
			);
		},
		undefined,
		{ equals: (a, b) => a?.id === b?.id },
	);
	createEffect(() => {
		const current = pending();
		if (current && !current.questions) context.channel.cancel(current.id);
	});
	context.reportPresence(() => (pending()?.questions ? "exclusive" : "hidden"));
	return (
		<box>
			{(() => {
				const current = pending();
				const questions = current?.questions;
				return (
					questions && (
						<Card context={context} id={current.id} questions={questions} />
					)
				);
			})()}
		</box>
	);
}

export default {
	modules: [
		{ id: "card", render: (context) => <QuestionSlot context={context} /> },
	],
	channels: [CHANNEL],
} satisfies Extension;
