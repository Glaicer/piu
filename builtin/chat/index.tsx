import { For } from "solid-js";
import type { Extension, ModuleContext } from "../../src/module.ts";
import type { PiMessage } from "../../src/pi-state.ts";
import { BackendCard } from "./backend-card.tsx";
import { createSyntaxStyle, Markdown } from "./markdown.tsx";

function Messages(props: { context: ModuleContext }) {
	const theme = props.context.theme;
	const pi = props.context.pi;
	const syntaxStyle = createSyntaxStyle(theme);
	props.context.onCleanup(() => syntaxStyle.destroy());
	return (
		<>
			<For each={pi.messages}>
				{(message, index) => {
					if (message.role === "assistant") {
						return (
							<Markdown
								text={messageText(message)}
								streaming={pi.streaming && index() === pi.messages.length - 1}
								syntaxStyle={syntaxStyle}
								theme={theme}
							/>
						);
					}
					return (
						message.role === "user" && (
							<text fg={theme.accent}>{`> ${messageText(message)}`}</text>
						)
					);
				}}
			</For>
			<BackendCard context={props.context} />
		</>
	);
}

function messageText(message: PiMessage): string {
	if (!("content" in message)) return "";
	if (typeof message.content === "string") return message.content;
	return message.content
		.map((block) => (block.type === "text" ? block.text : ""))
		.join("");
}

export default {
	modules: [
		{ id: "messages", render: (context) => <Messages context={context} /> },
	],
} satisfies Extension;
