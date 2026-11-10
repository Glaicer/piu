import { useTerminalDimensions } from "@opentui/solid";
import { type Accessor, createSignal, For, onCleanup } from "solid-js";
import { channelFor } from "./channel.ts";
import type { ModuleContext, PlacedModule, Presence } from "./module.ts";

export type Size = number | `${number}%` | "rest" | "content";
type Direction = "row" | "column";
type SlotBase = {
	id: string;
	direction: Direction;
	size: Size;
	minSize?: number;
	hideBelow?: number;
};
export type Slot =
	| (SlotBase & { kind: "container"; children: readonly Slot[] })
	| (SlotBase & { kind: "panel" });

type PanelContext = Omit<ModuleContext, "onCleanup" | "settings" | "channel">;
export type SharedContext = Omit<PanelContext, "reportPresence">;

type SlotProps = {
	slot: Slot;
	parentDirection: Direction;
	panels: ReadonlyMap<string, readonly PlacedModule[]>;
	context: SharedContext;
};

export function SlotView(props: SlotProps) {
	const slot = props.slot;
	const sizing = sizeStyle(slot, props.parentDirection);
	const terminal = useTerminalDimensions();
	const visible = () => terminal().width >= (slot.hideBelow ?? 0);
	if (slot.kind === "container") {
		return (
			<box {...sizing} visible={visible()} flexDirection={slot.direction}>
				<For each={slot.children}>
					{(child) => (
						<SlotView
							slot={child}
							parentDirection={slot.direction}
							panels={props.panels}
							context={props.context}
						/>
					)}
				</For>
			</box>
		);
	}
	const entries = (props.panels.get(slot.id) ?? []).map((placed) => {
		const [presence, setPresence] = createSignal<Accessor<Presence>>(
			() => "shown",
		);
		return {
			placed,
			presence: () => presence()(),
			setPresence: (next: Accessor<Presence>) => setPresence(() => next),
		};
	});
	const claimant = () => entries.find((e) => e.presence() === "exclusive");
	const shown = (entry: (typeof entries)[number]) => {
		const owner = claimant();
		return owner ? owner === entry : entry.presence() !== "hidden";
	};
	const followsOutput = () =>
		entries.some((entry) => shown(entry) && entry.placed.module.followsOutput);
	const modules = (
		<For each={entries}>
			{(entry) => (
				<box visible={shown(entry)}>
					<ModuleView
						placed={entry.placed}
						context={{ ...props.context, reportPresence: entry.setPresence }}
					/>
				</box>
			)}
		</For>
	);
	if (slot.size === "content") {
		return (
			<box
				{...sizing}
				visible={visible() && entries.some(shown)}
				border
				borderColor={props.context.theme.border}
				flexDirection={slot.direction}
			>
				{modules}
			</box>
		);
	}
	return (
		<scrollbox
			{...sizing}
			visible={visible()}
			border
			borderColor={props.context.theme.border}
			stickyScroll={followsOutput()}
			stickyStart="bottom"
			contentOptions={{ flexDirection: slot.direction }}
		>
			{modules}
		</scrollbox>
	);
}

function ModuleView(props: { placed: PlacedModule; context: PanelContext }) {
	const cleanups: (() => void)[] = [];
	onCleanup(() => {
		for (const cleanup of cleanups) cleanup();
	});
	const { pi, actions } = props.context;
	return props.placed.module.render({
		...props.context,
		settings: props.placed.settings,
		channel: channelFor(
			props.placed.id.split(".")[0] ?? "",
			() => pi.dialogs,
			actions.answerDialog,
		),
		onCleanup: (cleanup) => cleanups.push(cleanup),
	});
}

function sizeStyle(slot: Slot, parentDirection: Direction) {
	const [length, min] =
		parentDirection === "row"
			? (["width", "minWidth"] as const)
			: (["height", "minHeight"] as const);
	// shortcut: "rest" shrinks from 100% instead of growing from 0: Yoga clamps a grown item's basis up to minSize first, which skews the split even when minSize doesn't bind. Revisit if OpenTUI's layout engine stops clamping.
	const flex =
		slot.size === "rest"
			? { flexShrink: 1, [length]: "100%" as const }
			: slot.size === "content"
				? { flexShrink: 0 }
				: { flexShrink: 0, [length]: slot.size };
	return { ...flex, [min]: slot.minSize };
}
