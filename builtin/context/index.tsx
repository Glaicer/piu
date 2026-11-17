import { createEffect, onCleanup } from "solid-js";
import {
	CONTEXT_USAGE_COMMAND,
	CONTEXT_USAGE_DESCRIPTION,
} from "../../src/context-usage.ts";
import type { Extension, ModuleContext } from "../../src/module.ts";
import { contextUsageModal } from "./modal.tsx";

function ContextHost(props: { context: ModuleContext }) {
	const { context } = props;
	let close: (() => void) | undefined;
	let lastOpen = -1;
	const forgetClose = () => {
		close = undefined;
	};
	const closeModal = () => {
		const opened = close;
		close = undefined;
		opened?.();
	};
	createEffect(() => {
		const view = context.pi.contextUsage;
		if (!view) {
			lastOpen = -1;
			closeModal();
			return;
		}
		if (close) {
			lastOpen = view.open;
			return;
		}
		// why: dismissal forgets the close function but keeps the number, so a later push that refreshes the same request never reopens a Modal the user closed.
		if (view.open === lastOpen) return;
		lastOpen = view.open;
		close = context.actions.openModal(contextUsageModal(forgetClose));
	});
	onCleanup(closeModal);
	context.reportPresence(() => "hidden");
	return <box />;
}

export default {
	modules: [
		{
			id: "host",
			render: (context) => <ContextHost context={context} />,
		},
	],
	commands: [
		{
			name: "context",
			description: CONTEXT_USAGE_DESCRIPTION,
			takesArguments: false,
			run: (context) => {
				void context.actions.prompt(`/${CONTEXT_USAGE_COMMAND}`);
			},
		},
	],
} satisfies Extension;
