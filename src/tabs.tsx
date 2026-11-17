import { type Renderable, TextAttributes } from "@opentui/core";
import type { JSX } from "@opentui/solid";
import { createSignal, For } from "solid-js";
import type { Theme } from "./theme.ts";

const GAP = "   ";

export function Tabs<T extends string>(props: {
	tabs: readonly T[];
	active: T;
	theme: Theme;
	label?: (tab: T) => string;
	onSelect(tab: T): void;
}): JSX.Element {
	const label = (tab: T) => props.label?.(tab) ?? tab;
	const [width, setWidth] = createSignal(0);
	const tail = () =>
		Math.max(
			0,
			width() -
				(1 +
					props.tabs.reduce(
						(total, tab) => total + label(tab).length + GAP.length,
						0,
					)),
		);
	const rule = (tab: T) =>
		(tab === props.active ? "━" : "─").repeat(label(tab).length);
	return (
		<box
			flexDirection="column"
			onSizeChange={function (this: Renderable) {
				queueMicrotask(() => setWidth(this.width));
			}}
		>
			<box flexDirection="row" flexShrink={0}>
				<text> </text>
				<For each={props.tabs}>
					{(tab) => (
						<box
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
}
