import { useRenderer } from "@opentui/solid";
import { createEffect, createMemo, onCleanup } from "solid-js";
import type { ChannelPayload } from "../../src/channel.ts";
import type { Extension, ModuleContext } from "../../src/module.ts";
import { Picker } from "../../src/picker.tsx";
import { CHANNEL, type Question, type Reply } from "./protocol.ts";

type Pending = { readonly id: string; readonly question: Question | undefined };

function firstQuestion(payload: ChannelPayload): Question | undefined {
	const [question] = Array.isArray(payload.questions) ? payload.questions : [];
	if (
		typeof question?.question === "string" &&
		typeof question.header === "string" &&
		Array.isArray(question.options) &&
		question.options.every(
			(option: unknown) =>
				typeof option === "object" &&
				option !== null &&
				"label" in option &&
				typeof option.label === "string",
		)
	) {
		return question;
	}
}

function Card(props: {
	context: ModuleContext;
	id: string;
	question: Question;
}) {
	const { context, id, question } = props;
	const renderer = useRenderer();
	const previous = renderer.currentFocusedRenderable;
	onCleanup(() => {
		if (previous && !previous.isDestroyed) previous.focus();
	});
	const reply = (label: string): Reply => ({ answers: [[label]] });
	const dismiss = () => context.channel.cancel(id);
	return (
		<box flexDirection="column">
			<text fg={context.theme.accent}>{` ${question.header}`}</text>
			<text fg={context.theme.text}>{` ${question.question}`}</text>
			<Picker
				theme={context.theme}
				items={question.options.map((option) => ({
					label: option.label,
					detail: option.description,
					value: option.label,
				}))}
				selected={0}
				onPick={(label) => context.channel.answer(id, reply(label))}
				onCancel={dismiss}
			/>
			<box
				onMouseDown={(event) => {
					event.preventDefault();
					dismiss();
				}}
			>
				<text fg={context.theme.muted}>{" Dismiss (Esc)"}</text>
			</box>
		</box>
	);
}

function QuestionSlot(props: { context: ModuleContext }) {
	const { context } = props;
	const pending = createMemo(
		(): Pending | undefined => {
			const request = context.channel.requests.find(
				(r) => r.channel === CHANNEL,
			);
			return (
				request && { id: request.id, question: firstQuestion(request.payload) }
			);
		},
		undefined,
		{ equals: (a, b) => a?.id === b?.id },
	);
	createEffect(() => {
		const current = pending();
		if (current && !current.question) context.channel.cancel(current.id);
	});
	context.reportPresence(() => (pending()?.question ? "exclusive" : "hidden"));
	return (
		<box>
			{(() => {
				const current = pending();
				const question = current?.question;
				return (
					question && (
						<Card context={context} id={current.id} question={question} />
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
