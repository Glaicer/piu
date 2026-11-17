import {
	type KeyEvent,
	TextAttributes,
	type TextareaRenderable,
} from "@opentui/core";
import { createEffect, createSignal, untrack } from "solid-js";
import {
	modalFrameColumns,
	modalHintColumns,
	untitledModalFrameRows,
} from "./layout.tsx";
import { type ModalRequest, type Modals, moduleModal } from "./modal.tsx";
import type { ModuleContext } from "./module.ts";
import type { Dialog, DialogAnswer, PiActions, PiState } from "./pi-state.ts";
import { Picker } from "./picker.tsx";

type ModalDialog = Exclude<Dialog, { method: "channel" }>;

const WIDTH = 60;
const MAX_VISIBLE_OPTIONS = 12;
const EDITOR_ROWS = 10;

const editorKeys = [
	{ name: "return", shift: true, action: "newline" as const },
];

function lineCount(text: string, indent = 0) {
	return text
		.split("\n")
		.reduce(
			(rows, line) =>
				rows +
				Math.max(
					1,
					Math.ceil(line.length / (WIDTH - modalFrameColumns - indent)),
				),
			0,
		);
}

function Body(props: {
	context: ModuleContext;
	dialog: ModalDialog;
	answer(a: DialogAnswer): void;
}) {
	const { dialog, context, answer } = props;
	const [typed, setTyped] = createSignal("");
	let field: TextareaRenderable | undefined;
	const choice = (labels: readonly string[]) => (
		<Picker
			theme={context.theme}
			items={labels.map((label) => ({ label, value: label }))}
			selected={0}
			onPick={(label) =>
				answer(
					dialog.method === "confirm"
						? { confirmed: label === "Yes" }
						: { value: label },
				)
			}
		/>
	);
	const editorKeyDown = (event: KeyEvent) => {
		if (event.name !== "return" || event.shift) return;
		event.preventDefault();
		answer({ value: field?.plainText ?? "" });
	};
	return (
		<box flexDirection="column">
			<text
				fg={context.theme.accent}
				attributes={TextAttributes.BOLD}
				paddingLeft={1}
				paddingRight={modalHintColumns}
				marginBottom={1}
			>
				{dialog.title}
			</text>
			{dialog.method === "select" && choice(dialog.options)}
			{dialog.method === "confirm" && (
				<>
					<text fg={context.theme.muted}>{` ${dialog.message}`}</text>
					{choice(["Yes", "No"])}
				</>
			)}
			{dialog.method === "input" && (
				<input
					focused
					placeholder={dialog.placeholder ?? ""}
					textColor={context.theme.text}
					cursorColor={context.theme.text}
					onInput={setTyped}
					onSubmit={() => answer({ value: typed() })}
				/>
			)}
			{dialog.method === "editor" && (
				<>
					<text fg={context.theme.muted}>
						{" Enter to submit, Shift+Enter for a new line, Esc to cancel"}
					</text>
					<textarea
						ref={(element: TextareaRenderable) => {
							field = element;
							element.setText(dialog.prefill ?? "");
							element.gotoBufferEnd();
						}}
						focused
						textColor={context.theme.text}
						cursorColor={context.theme.text}
						keyBindings={editorKeys}
						onKeyDown={editorKeyDown}
					/>
				</>
			)}
		</box>
	);
}

function height(dialog: ModalDialog) {
	const title = lineCount(dialog.title, 1 + modalHintColumns) + 1;
	switch (dialog.method) {
		case "select":
			return (
				title +
				Math.min(dialog.options.length, MAX_VISIBLE_OPTIONS) +
				untitledModalFrameRows
			);
		case "confirm":
			return title + lineCount(dialog.message) + 2 + untitledModalFrameRows;
		case "input":
			return title + 1 + untitledModalFrameRows;
		case "editor":
			return title + 1 + EDITOR_ROWS + untitledModalFrameRows;
	}
}

function dialogModal(
	dialog: ModalDialog,
	actions: Pick<PiActions, "answerDialog">,
	screenRows: number,
): ModalRequest {
	const answer = (given: DialogAnswer) =>
		actions.answerDialog(dialog.id, given);
	return {
		...moduleModal(
			{
				id: `dialog-${dialog.id}`,
				render: (context) => (
					<Body context={context} dialog={dialog} answer={answer} />
				),
			},
			{ width: WIDTH, height: Math.min(height(dialog), screenRows) },
		),
		onDismiss: () => {
			answer({ cancelled: true });
		},
	};
}

export function bridgeDialogs(
	pi: { state: PiState; actions: PiActions },
	modals: Modals,
	screenRows: () => number,
) {
	const open = new Map<string, () => void>();
	createEffect(() => {
		const dialogs = pi.state.dialogs.filter(
			(dialog): dialog is ModalDialog => dialog.method !== "channel",
		);
		untrack(() => {
			for (const [id, close] of open) {
				if (dialogs.some((dialog) => dialog.id === id)) continue;
				close();
				open.delete(id);
			}
			for (const dialog of dialogs) {
				if (open.has(dialog.id)) continue;
				open.set(
					dialog.id,
					modals.open(dialogModal(dialog, pi.actions, screenRows())),
				);
			}
		});
	});
}
