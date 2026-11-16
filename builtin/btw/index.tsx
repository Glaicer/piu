import { createEffect } from "solid-js";
import { BTW_CHANNEL, BTW_DESCRIPTION } from "../../src/btw.ts";
import type { DismissReason } from "../../src/modal.tsx";
import type { Extension, ModuleContext } from "../../src/module.ts";
import { btwModal } from "./modal.tsx";

function BtwHost(props: { context: ModuleContext }) {
	const { context } = props;
	let close: (() => void) | undefined;
	let dismissed = false;
	const closeModal = () => {
		dismissed = true;
		const opened = close;
		close = undefined;
		opened?.();
	};
	// why: Esc during an answer stops it and leaves the Modal open, while closing by any means during an answer interrupts it; a dismissal before the next question is answered still has to cancel that question's claim on the side thread.
	const dismiss = (reason: DismissReason) => {
		const request = context.channel.requests[0];
		if (context.pi.btw?.streaming && request) {
			context.channel.answer(request.id, { v: 1, stop: true });
			if (reason === "escape") return false;
		} else if (request) {
			context.channel.cancel(request.id);
		}
		closeModal();
	};
	createEffect(() => {
		const side = context.pi.btw;
		const request = context.channel.requests[0];
		if (!side) {
			dismissed = false;
			const opened = close;
			close = undefined;
			opened?.();
			// why: a question dialog whose side thread Pi has already dropped must not wait forever.
			if (request) context.channel.cancel(request.id);
			return;
		}
		if (dismissed) {
			if (request) context.channel.cancel(request.id);
			return;
		}
		close ??= context.actions.openModal(btwModal(side.model, dismiss));
	});
	context.reportPresence(() => "hidden");
	return <box />;
}

export default {
	modules: [
		{
			id: "side",
			render: (context) => <BtwHost context={context} />,
		},
	],
	commands: [
		{
			name: "btw",
			description: BTW_DESCRIPTION,
			takesArguments: true,
			run: (context, args) => {
				const question = args.trim();
				void context.actions.prompt(question ? `/btw ${question}` : "/btw");
			},
		},
	],
	channels: [BTW_CHANNEL],
} satisfies Extension;
