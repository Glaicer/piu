import type { KeyEvent, Renderable } from "@opentui/core";
import { useTerminalDimensions } from "@opentui/solid";
import { type Accessor, createSignal, For, onCleanup } from "solid-js";
import { channelFor } from "./channel.ts";
import type { PanelFocus } from "./focus.ts";
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

type PanelContext = Omit<
	ModuleContext,
	"onCleanup" | "settings" | "channel" | "holdFocusKeys"
>;
export type SharedContext = Omit<PanelContext, "reportPresence" | "onKey"> & {
	focus?: PanelFocus;
};

type SlotProps = {
	slot: Slot;
	parentDirection: Direction;
	panels: ReadonlyMap<string, readonly PlacedModule[]>;
	context: SharedContext;
};

export function SlotView(props: SlotProps) {
	const slot = props.slot;
	const { focus, ...shared } = props.context;
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
		const keyHandlers: ((event: KeyEvent) => void)[] = [];
		return {
			placed,
			presence: () => presence()(),
			setPresence: (next: Accessor<Presence>) => setPresence(() => next),
			keyHandlers,
		};
	});
	const claimant = () => entries.find((e) => e.presence() === "exclusive");
	const shown = (entry: (typeof entries)[number]) => {
		const owner = claimant();
		return owner ? owner === entry : entry.presence() !== "hidden";
	};
	const followsOutput = () =>
		entries.some((entry) => shown(entry) && entry.placed.module.followsOutput);
	let element: Renderable | undefined;
	focus?.register({
		id: slot.id,
		element: () => element,
		shown: () => entries.some(shown),
	});
	const focused = () => focus?.isFocused(slot.id) ?? false;
	const frame = () => ({
		borderColor: focused() ? shared.theme.accent : shared.theme.border,
		title: focused() ? ` ${slot.id} ` : undefined,
	});
	const routeKey = (event: KeyEvent) => {
		for (const entry of entries) {
			if (!shown(entry)) continue;
			for (const handler of entry.keyHandlers) handler(event);
			if (event.defaultPrevented) return;
		}
	};
	const modules = (
		<For each={entries}>
			{(entry) => (
				<box visible={shown(entry)}>
					<ModuleView
						placed={entry.placed}
						context={{
							...shared,
							reportPresence: entry.setPresence,
							onKey: (handler) => entry.keyHandlers.push(handler),
							holdFocusKeys: (active) => focus?.hold(active),
						}}
					/>
				</box>
			)}
		</For>
	);
	if (slot.size === "content") {
		return (
			<box
				ref={(node: Renderable) => {
					element = node;
				}}
				{...sizing}
				visible={visible() && entries.some(shown)}
				border
				{...frame()}
				flexDirection={slot.direction}
			>
				{modules}
			</box>
		);
	}
	return (
		<scrollbox
			ref={(node: Renderable) => {
				element = node;
			}}
			{...sizing}
			visible={visible()}
			border
			{...frame()}
			onKeyDown={routeKey}
			stickyScroll={followsOutput()}
			stickyStart="bottom"
			contentOptions={{ flexDirection: slot.direction }}
		>
			{modules}
		</scrollbox>
	);
}

type ModuleViewContext = PanelContext & Pick<ModuleContext, "holdFocusKeys">;

function ModuleView(props: {
	placed: PlacedModule;
	context: ModuleViewContext;
}) {
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
