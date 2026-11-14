import {
	type KeyEvent,
	type Renderable,
	ScrollBoxRenderable,
} from "@opentui/core";
import { useTerminalDimensions } from "@opentui/solid";
import { type Accessor, createSignal, For, onCleanup } from "solid-js";
import { paintCard } from "./card.ts";
import { channelFor } from "./channel.ts";
import type { PanelFocus } from "./focus.ts";
import type { ModuleContext, PlacedModule, Presence } from "./module.ts";
import { createSmoothScroll } from "./smooth-scroll.ts";

export type Size = number | `${number}%` | "rest" | "content";
type Direction = "row" | "column";
type SlotBase = {
	id: string;
	direction: Direction;
	size: Size;
	minSize?: number;
	hideBelow?: number;
	title?: string;
	joinAbove?: boolean;
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
	inContent?: boolean;
	modal?: boolean;
	joinedAt?: () => number | undefined;
	panels: ReadonlyMap<string, readonly PlacedModule[]>;
	context: SharedContext;
};

// why: the frame takes one cell on every side, and a blank column keeps text off its left edge; a Modal floats, so it gets a row and a column more of air on each side.
const panelFrame = { padding: 1, paddingLeft: 2 };
const modalFrame = {
	paddingTop: 2,
	paddingBottom: 2,
	paddingLeft: 3,
	paddingRight: 2,
};
export const modalFrameRows = modalFrame.paddingTop + modalFrame.paddingBottom;
export const modalFrameColumns =
	modalFrame.paddingLeft + modalFrame.paddingRight;

export function SlotView(props: SlotProps) {
	const slot = props.slot;
	const { focus, ...shared } = props.context;
	const sizing = sizeStyle(
		slot,
		props.parentDirection,
		props.inContent ?? false,
	);
	const terminal = useTerminalDimensions();
	// why: a "content" slot never takes the last two cells of the screen, so a "rest" Panel next to it keeps its frame; Yoga then shrinks the one Panel inside it that may shrink (a tall card) instead of letting the slot push the rest off screen. Yoga's shrink shares of two flexible siblings turn out unreliable, so the cap is explicit.
	const limit = (): { maxWidth?: number; maxHeight?: number } => {
		if (slot.size !== "content") return {};
		return props.parentDirection === "row"
			? { maxWidth: terminal().width - 2 }
			: { maxHeight: terminal().height - 2 };
	};
	const visible = () => terminal().width >= (slot.hideBelow ?? 0);
	if (slot.kind === "container") {
		let container: Renderable | undefined;
		const joinedAt = () =>
			slot.joinAbove && props.parentDirection === "column"
				? container?.screenY
				: props.joinedAt?.();
		return (
			<box
				ref={(node: Renderable) => {
					container = node;
				}}
				{...sizing}
				{...limit()}
				visible={visible()}
				flexDirection={slot.direction}
			>
				<For each={slot.children}>
					{(child) => (
						<SlotView
							slot={child}
							parentDirection={slot.direction}
							inContent={slot.size === "content"}
							modal={props.modal}
							joinedAt={joinedAt}
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
	let frameElement: Renderable | undefined;
	focus?.register({
		id: slot.id,
		element: () => element,
		shown: () => entries.some(shown),
		handlesKeys: () =>
			entries.some((entry) => shown(entry) && entry.keyHandlers.length > 0),
		jumpChat: (bottom) => {
			if (
				!visible() ||
				!followsOutput() ||
				!(element instanceof ScrollBoxRenderable)
			)
				return false;
			smoothScroll.cancel();
			element.scrollTo(bottom ? Infinity : 0);
			return true;
		},
	});
	const focused = () => focus?.isFocused(slot.id) ?? false;
	const fill = () => (props.modal ? shared.theme.raised : shared.theme.surface);
	const title = () =>
		focused()
			? (slot.title ?? slot.id)
			: props.modal
				? entries[0]?.placed.module.title
				: undefined;
	const frame = {
		...(props.modal ? modalFrame : panelFrame),
		renderBefore: paintCard(() => ({
			fill: fill(),
			edge: shared.theme.border,
			title: title(),
			titleColor: props.modal ? shared.theme.text : shared.theme.accent,
			joinedAt:
				slot.joinAbove && props.parentDirection === "column"
					? frameElement?.screenY
					: props.joinedAt?.(),
		})),
	};
	const routeKey = (event: KeyEvent) => {
		for (const entry of entries) {
			if (!shown(entry)) continue;
			for (const handler of entry.keyHandlers) handler(event);
			if (event.defaultPrevented) return;
		}
	};
	const moduleView = (entry: (typeof entries)[number]) => (
		<box visible={shown(entry)} minHeight={entry.placed.module.minHeight}>
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
	);
	const modules = <For each={entries}>{(entry) => moduleView(entry)}</For>;
	if (slot.size === "content") {
		return (
			<box
				ref={(node: Renderable) => {
					element = node;
					frameElement = node;
				}}
				{...sizing}
				{...limit()}
				visible={visible() && entries.some(shown)}
				{...frame}
				flexDirection={slot.direction}
			>
				{modules}
			</box>
		);
	}
	const smoothScroll = createSmoothScroll(shared.animate);
	onCleanup(smoothScroll.cancel);
	const [awayFromBottom, setAwayFromBottom] = createSignal(false);
	const [footerHeight, setFooterHeight] = createSignal(0);
	// why: a footer Module shares the Panel border but stays outside the scrollbox, so it remains visible while the content scrolls.
	const scrolled = entries.filter((entry) => !entry.placed.module.footer);
	const footers = entries.filter((entry) => entry.placed.module.footer);
	return (
		<box
			ref={(node: Renderable) => {
				frameElement = node;
			}}
			{...sizing}
			visible={visible()}
			{...frame}
			flexDirection="column"
		>
			<scrollbox
				ref={(node: ScrollBoxRenderable) => {
					element = node;
					const update = () =>
						setAwayFromBottom(
							node.scrollTop < node.scrollHeight - node.viewport.height,
						);
					node.verticalScrollBar.on("change", update);
					node.content.on("resize", update);
					node.viewport.on("resize", update);
				}}
				width="100%"
				flexGrow={1}
				flexShrink={1}
				onKeyDown={routeKey}
				onMouseScroll={smoothScroll.wheel}
				stickyScroll={followsOutput()}
				stickyStart="bottom"
				contentOptions={{ flexDirection: slot.direction }}
				scrollbarOptions={{
					trackOptions: {
						foregroundColor: shared.theme.border,
						backgroundColor: fill(),
					},
				}}
			>
				<For each={scrolled}>{(entry) => moduleView(entry)}</For>
			</scrollbox>
			<box
				flexDirection="column"
				flexShrink={0}
				onSizeChange={function (this: Renderable) {
					queueMicrotask(() => setFooterHeight(this.height));
				}}
			>
				<For each={footers}>{(entry) => moduleView(entry)}</For>
			</box>
			{followsOutput() && awayFromBottom() && (
				<box
					position="absolute"
					right={2}
					bottom={footerHeight() + 1}
					backgroundColor={shared.theme.raised}
				>
					<text fg={shared.theme.muted}>CTRL+End: jump to bottom</text>
				</box>
			)}
		</box>
	);
}

type ModuleViewContext = PanelContext & Pick<ModuleContext, "holdFocusKeys">;

function ModuleView(props: {
	placed: PlacedModule;
	context: ModuleViewContext;
}) {
	const cleanups: (() => void)[] = [];
	const animations = new Set<() => void>();
	onCleanup(() => {
		for (const cleanup of cleanups) cleanup();
		for (const cancel of animations) cancel();
	});
	const { pi, actions } = props.context;
	return props.placed.module.render({
		...props.context,
		animate: (options) => {
			let finished = false;
			let cancel: () => void = () => {};
			cancel = props.context.animate({
				...options,
				onComplete: () => {
					finished = true;
					animations.delete(cancel);
					options.onComplete?.();
				},
			});
			if (!finished) animations.add(cancel);
			return () => {
				animations.delete(cancel);
				cancel();
			};
		},
		settings: props.placed.settings,
		channel: channelFor(
			props.placed.id.split(".")[0] ?? "",
			() => pi.dialogs,
			actions.answerDialog,
		),
		onCleanup: (cleanup) => cleanups.push(cleanup),
	});
}

function sizeStyle(slot: Slot, parentDirection: Direction, inContent: boolean) {
	const [length, min] =
		parentDirection === "row"
			? (["width", "minWidth"] as const)
			: (["height", "minHeight"] as const);
	// shortcut: "rest" shrinks from 100% instead of growing from 0: Yoga clamps a grown item's basis up to minSize first, which skews the split even when minSize doesn't bind. Revisit if OpenTUI's layout engine stops clamping.
	const flex =
		slot.size === "rest"
			? { flexShrink: 1, [length]: "100%" as const }
			: slot.size === "content"
				? { flexShrink: slot.kind === "panel" && inContent ? 1 : 0 }
				: { flexShrink: 0, [length]: slot.size };
	return {
		...flex,
		[min]: slot.minSize,
		// why: adjacent contours share one terminal row; only frame padding overlaps, never Module content.
		marginTop: slot.joinAbove && parentDirection === "column" ? -1 : 0,
	};
}
