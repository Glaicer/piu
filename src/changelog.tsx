import type { Renderable } from "@opentui/core";
import { createSyntaxStyle, Markdown } from "../builtin/chat/markdown.tsx";
import { type ModalRequest, moduleModal } from "./modal.tsx";
import { scrollBoxOf } from "./scroll.ts";

export function changelogModal(
	markdown: string,
	onDismiss: () => void,
): ModalRequest {
	return {
		...moduleModal(
			{
				id: "changelog",
				title: "What's new",
				render: (context) => {
					let box: Renderable | undefined;
					const syntaxStyle = createSyntaxStyle(context.theme);
					return (
						<box
							ref={(node: Renderable) => {
								box = node;
							}}
							flexDirection="column"
							focusable
							focused
							onKeyDown={(event) => {
								const scroll = box && scrollBoxOf(box);
								if (scroll?.handleKeyPress(event)) event.preventDefault();
							}}
						>
							<Markdown
								text={markdown}
								streaming={false}
								syntaxStyle={syntaxStyle}
								theme={context.theme}
							/>
						</box>
					);
				},
			},
			{ width: "80%", height: "80%" },
		),
		onDismiss: () => {
			onDismiss();
		},
	};
}
