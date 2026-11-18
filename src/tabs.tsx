import { type Renderable, TextAttributes } from "@opentui/core";
import type { JSX } from "@opentui/solid";
import { stringWidth } from "bun";
import { createEffect, createSignal, For } from "solid-js";
import { scrollIntoView } from "./scroll.ts";
import type { Theme } from "./theme.ts";

const GAP = "   ";

export function Tabs<T extends string | number>(props: {
	tabs: readonly T[];
	active: T;
	theme: Theme;
	label?: (tab: T) => string;
	scrollable?: boolean;
	onSelect(tab: T): void;
}): JSX.Element {
	const label = (tab: T) => props.label?.(tab) ?? String(tab);
	const [width, setWidth] = createSignal(0);
	const length = (tab: T) => stringWidth(label(tab));
	const stripWidth = () =>
		1 + props.tabs.reduce((total, tab) => total + length(tab) + GAP.length, 0);
	const tail = () => Math.max(0, width() - stripWidth());
	const rule = (tab: T) =>
		(tab === props.active ? "━" : "─").repeat(length(tab));
	const cells = new Map<T, Renderable>();
	if (props.scrollable) {
		createEffect(() => {
			const active = props.active;
			queueMicrotask(() => scrollIntoView(cells.get(active)));
		});
	}
	const strip = (
		<box
			flexDirection="column"
			minWidth={props.scrollable ? stripWidth() : undefined}
			onSizeChange={function (this: Renderable) {
				queueMicrotask(() => setWidth(this.width));
			}}
		>
			<box flexDirection="row" flexShrink={0}>
				<text> </text>
				<For each={props.tabs}>
					{(tab) => (
						<box
							ref={(node: Renderable) => cells.set(tab, node)}
							onMouseDown={(event) => {
								event.preventDefault();
								props.onSelect(tab);
							}}
						>
							<text
								fg={
									tab === props.active ? props.theme.accent : props.theme.muted
								}
								attributes={
									tab === props.active ? TextAttributes.BOLD : undefined
								}
							>{`${label(tab)}${GAP}`}</text>
						</box>
					)}
				</For>
			</box>
			<box flexDirection="row" flexShrink={0}>
				<text fg={props.theme.border}> </text>
				<For each={props.tabs}>
					{(tab) => (
						<>
							<text
								fg={
									tab === props.active ? props.theme.accent : props.theme.border
								}
							>
								{rule(tab)}
							</text>
							<text fg={props.theme.border}>{"─".repeat(GAP.length)}</text>
						</>
					)}
				</For>
				<text fg={props.theme.border} wrapMode="none">
					{"─".repeat(tail())}
				</text>
			</box>
		</box>
	);
	return props.scrollable ? (
		<scrollbox
			height={2}
			flexShrink={0}
			scrollX
			scrollY={false}
			horizontalScrollbarOptions={{ visible: false }}
		>
			{strip}
		</scrollbox>
	) : (
		strip
	);
}
