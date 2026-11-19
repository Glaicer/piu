import type { BoxRenderable } from "@opentui/core";
import { For, onMount } from "solid-js";
import { moduleModal } from "./modal.tsx";
import type { CommandContext } from "./module.ts";
import { scrollKeys } from "./scroll.ts";
import type { Theme } from "./theme.ts";

const groups = {
	Navigation: [
		["↑ | ↓", "Move vertically or browse prompt history"],
		["← | Ctrl+B", "Move left"],
		["→ | Ctrl+F", "Move right"],
		["Alt+← | Ctrl+← | Alt+B", "Move one word left"],
		["Alt+→ | Ctrl+→ | Alt+F", "Move one word right"],
		["Home | Ctrl+A", "Go to the start of the line"],
		["End | Ctrl+E", "Go to the end of the line"],
		["Ctrl+]", "Jump forward to a character"],
		["Ctrl+Alt+]", "Jump backward to a character"],
		["PgUp | Ctrl+PgUp", "Scroll up by a page"],
		["PgDn | Ctrl+PgDn", "Scroll down by a page"],
	],
	Editing: [
		["Enter", "Send message"],
		["Shift+Enter", "Insert a newline"],
		["Ctrl+W | Alt+Backspace", "Delete the previous word"],
		["Alt+D | Alt+Delete", "Delete the next word"],
		["Ctrl+U", "Delete to the start of the line"],
		["Ctrl+K", "Delete to the end of the line"],
		["Ctrl+Y", "Paste the most recently deleted text"],
		["Alt+Y", "Cycle through deleted text after pasting"],
		["Ctrl+-", "Undo"],
	],
	Other: [
		["Tab", "Accept autocomplete"],
		["Escape", "Cancel autocomplete or abort streaming"],
		[
			"Ctrl+C",
			"Clear the draft; when empty, ask for confirmation before exiting",
		],
		["Ctrl+D", "Exit when the prompt is empty"],
		["Alt+Enter", "Queue a follow-up message"],
		["/", "Start a slash command"],
		[
			"! | !!",
			"Run a shell command; !! excludes its output from model context",
		],
	],
} as const;

function ShortcutRow(props: {
	keyLabel: string;
	action: string;
	theme: Theme;
	header?: boolean;
}) {
	return (
		<box
			flexDirection="row"
			flexShrink={0}
			backgroundColor={props.header ? props.theme.raised : undefined}
		>
			<text
				width="45%"
				paddingX={1}
				fg={props.header ? props.theme.muted : props.theme.text}
				wrapMode="word"
			>
				{props.keyLabel}
			</text>
			<text
				flexGrow={1}
				flexBasis={0}
				paddingX={1}
				fg={props.header ? props.theme.muted : props.theme.text}
				wrapMode="word"
			>
				{props.action}
			</text>
		</box>
	);
}

function Reference(props: { theme: Theme }) {
	let body: BoxRenderable | undefined;
	onMount(() => body?.focus());
	return (
		<box
			ref={(node) => {
				body = node;
			}}
			focusable
			flexDirection="column"
			onKeyDown={(event) => {
				if (scrollKeys(event, body)) event.preventDefault();
			}}
		>
			<text fg={props.theme.muted}>These shortcuts cannot be reassigned.</text>
			<For each={Object.entries(groups)}>
				{([name, rows]) => (
					<box flexDirection="column" marginTop={1}>
						<text fg={props.theme.text}>
							<b>{name}</b>
						</text>
						<ShortcutRow
							keyLabel="Key"
							action="Action"
							theme={props.theme}
							header
						/>
						<For each={rows}>
							{([key, action]) => (
								<ShortcutRow
									keyLabel={key}
									action={action}
									theme={props.theme}
								/>
							)}
						</For>
					</box>
				)}
			</For>
		</box>
	);
}

export function openSystemShortcuts(context: CommandContext) {
	context.actions.openModal(
		moduleModal(
			{
				id: "system-shortcuts",
				title: "System shortcuts",
				render: ({ theme }) => <Reference theme={theme} />,
			},
			{ width: "70%", height: "75%" },
		),
	);
}
