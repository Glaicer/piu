import { type BoxRenderable, ScrollBoxRenderable } from "@opentui/core";
import { createEffect, createSignal, For } from "solid-js";
import { moduleModal } from "./modal.tsx";
import type { ModuleContext } from "./module.ts";
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
		const row = rows[index()];
		if (!row) return;
		for (let node = row.parent; node; node = node.parent) {
			if (node instanceof ScrollBoxRenderable) {
				node.scrollChildIntoView(row);
				break;
			}
		}
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

export function PickerButton<T>(props: {
	context: ModuleContext;
	id: string;
	label: string;
	width: number;
	items(): readonly PickerItem<T>[];
	selected(): number;
	onPick(value: T): void;
}) {
	const { actions, theme } = props.context;
	const open = () => {
		const items = props.items();
		const close = actions.openModal(
			moduleModal(
				{
					id: props.id,
					render: () => (
						<Picker
							theme={theme}
							items={items}
							selected={props.selected()}
							onPick={(value) => {
								props.onPick(value);
								close();
							}}
						/>
					),
				},
				{
					width: props.width,
					height: Math.min(items.length, MAX_VISIBLE_ROWS) + BORDER_ROWS,
				},
			),
		);
	};
	return (
		<box
			onMouseDown={(event) => {
				event.preventDefault();
				open();
			}}
		>
			<text fg={theme.accent}>{` ${props.label} `}</text>
		</box>
	);
}
