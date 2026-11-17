import { createEffect } from "solid-js";
import { BTW_CHANNEL, BTW_DESCRIPTION } from "../../src/btw.ts";
import type { DismissReason } from "../../src/modal.tsx";
import type { Extension, ModuleContext } from "../../src/module.ts";
import { btwModal } from "./modal.tsx";

function BtwHost(props: { context: ModuleContext }) {
	const { context } = props;
	let close: (() => void) | undefined;
	let dismissed = false;
	const takeOpen = () => {
		const opened = close;
		close = undefined;
		return opened;
	};
	const closeModal = () => {
		dismissed = true;
		takeOpen()?.();
	};
	// why: Esc during an answer stops it and leaves the Modal open; any other close cancels the pending dialog, which aborts the stream and ends the side thread. A close before the next dialog exists still sets `dismissed`, so that dialog is cancelled when it arrives.
	const dismiss = (reason: DismissReason) => {
		const request = context.channel.requests[0];
		if (context.pi.btw?.streaming && reason === "escape" && request) {
			context.channel.answer(request.id, { v: 1, stop: true });
			return false;
		}
		if (request) context.channel.cancel(request.id);
		closeModal();
	};
	createEffect(() => {
		const side = context.pi.btw;
		const request = context.channel.requests[0];
		if (!side) {
			dismissed = false;
			takeOpen()?.();
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
