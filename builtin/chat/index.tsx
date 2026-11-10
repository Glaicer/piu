import { For } from "solid-js";
import type { Extension, ModuleContext } from "../../src/module.ts";
import type { PiMessage } from "../../src/pi-state.ts";
import type { ThemeToken } from "../../src/theme.ts";

const chatRoles: Record<
	"user" | "assistant",
	{ prefix: string; color: ThemeToken }
> = {
	user: { prefix: "> ", color: "accent" },
	assistant: { prefix: "", color: "text" },
};

function Messages(props: { context: ModuleContext }) {
	const theme = props.context.theme;
	return (
		<For each={props.context.pi.messages}>
			{(message) => {
				const role = chatRole(message);
				return (
					role && (
						<text fg={theme[role.color]}>
							{role.prefix + messageText(message)}
						</text>
					)
				);
			}}
		</For>
	);
}

function chatRole(message: PiMessage) {
	return message.role === "user" || message.role === "assistant"
		? chatRoles[message.role]
		: undefined;
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
