import type { BoxRenderable } from "@opentui/core";
import { createEffect, createSignal, For } from "solid-js";
import { moduleModal } from "./modal.tsx";
import type { CommandContext } from "./module.ts";
import { scrollIntoView } from "./scroll.ts";
import type { Theme } from "./theme.ts";

export type PickerItem<T> = {
	label: string;
	detail?: string;
	value: T;
};

export function Picker<T>(props: {
	items: readonly PickerItem<T>[];
	selected: number;
	theme: Theme;
	onPick(value: T): void;
	onCancel?(): void;
}) {
	const [index, setIndex] = createSignal(Math.max(0, props.selected));
	const rows: BoxRenderable[] = [];
	const pick = (at: number) => {
		const item = props.items[at];
		if (item) props.onPick(item.value);
	};
	const move = (step: number) =>
		setIndex((at) => Math.max(0, Math.min(props.items.length - 1, at + step)));
	createEffect(() => {
		scrollIntoView(rows[index()]);
	});
	return (
		<box
			flexDirection="column"
			focusable
			focused
			onKeyDown={(event) => {
				if (event.name === "up") move(-1);
				else if (event.name === "down") move(1);
				else if (event.name === "return") pick(index());
				else if (event.name === "escape") props.onCancel?.();
			}}
		>
			<For each={props.items}>
				{(item, at) => (
					<box
						ref={(element: BoxRenderable) => {
							rows[at()] = element;
						}}
						flexDirection="row"
						backgroundColor={at() === index() ? props.theme.border : undefined}
						onMouseOver={() => setIndex(at())}
						onMouseDown={(event) => {
							event.preventDefault();
							pick(at());
						}}
					>
						<text fg={props.theme.text}>{` ${item.label}`}</text>
						<text fg={props.theme.muted}>
							{item.detail ? `  ${item.detail}` : ""}
						</text>
					</box>
				)}
			</For>
		</box>
	);
}

const MAX_VISIBLE_ROWS = 16;
const BORDER_ROWS = 2;

export type PickerOptions<T> = {
	id: string;
	width: number;
	items(): readonly PickerItem<T>[];
	selected(): number;
	onPick(value: T): void;
};

export function openPicker<T>(
	{ actions, theme }: CommandContext,
	picker: PickerOptions<T>,
) {
	const items = picker.items();
	const close = actions.openModal(
		moduleModal(
			{
				id: picker.id,
				render: () => (
					<Picker
						theme={theme}
						items={items}
						selected={picker.selected()}
						onPick={(value) => {
							picker.onPick(value);
							close();
						}}
					/>
				),
			},
			{
				width: picker.width,
				height: Math.min(items.length, MAX_VISIBLE_ROWS) + BORDER_ROWS,
			},
		),
	);
}

export function PickerLink(props: {
	context: CommandContext;
	label: string;
	onPress(): void;
}) {
	return (
		<box
			onMouseDown={(event) => {
				event.preventDefault();
				props.onPress();
			}}
		>
			<text fg={props.context.theme.accent}>{` ${props.label} `}</text>
		</box>
	);
}

export function PickerButton<T>(props: {
	context: CommandContext;
	label: string;
	picker: PickerOptions<T>;
}) {
	return (
		<PickerLink
			context={props.context}
			label={props.label}
			onPress={() => openPicker(props.context, props.picker)}
		/>
	);
}
