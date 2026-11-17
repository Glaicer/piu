import { createEffect, onCleanup } from "solid-js";
import {
	CONTEXT_USAGE_COMMAND,
	CONTEXT_USAGE_DESCRIPTION,
} from "../../src/context-usage.ts";
import type { Extension, ModuleContext } from "../../src/module.ts";
import { contextModal } from "./modal.tsx";
import { createContextModalState } from "./state.ts";

function ContextHost(props: { context: ModuleContext }) {
	const { context } = props;
	let close: (() => void) | undefined;
	let state: ReturnType<typeof createContextModalState> | undefined;
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
			if (view.open === lastOpen) return;
			lastOpen = view.open;
			state?.setTab(view.tab);
			return;
		}
		// why: dismissal forgets the close function but keeps the number, so a later push that refreshes the same request never reopens a Modal the user closed.
		if (view.open === lastOpen) return;
		lastOpen = view.open;
		state = createContextModalState(view.tab);
		close = context.actions.openModal(contextModal(state, forgetClose));
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
			run: (context, args) => {
				const view = args.trim();
				const target =
					view === "" ? "" : view === "injections" ? " injections" : undefined;
				if (target === undefined) {
					context.actions.showToast(
						`Unknown /context view "${view}". Use /context or /context injections.`,
						"error",
					);
					return;
				}
				void context.actions.prompt(`/${CONTEXT_USAGE_COMMAND}${target}`);
			},
		},
	],
} satisfies Extension;
