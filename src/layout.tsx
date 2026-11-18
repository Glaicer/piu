import {
	type KeyEvent,
	type MouseEvent,
	type Renderable,
	ScrollBoxRenderable,
} from "@opentui/core";
import { type Accessor, createSignal, For, onCleanup } from "solid-js";
import type { Animate } from "./animate.ts";
import { paintPanel, paintSheet, sheetHintOffset } from "./card.ts";
import { channelFor } from "./channel.ts";
import type { PanelFocus } from "./focus.ts";
import { formatChord } from "./keybindings.ts";
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
	| (SlotBase & { kind: "panel"; bar?: boolean });

type PanelContext = Omit<
	ModuleContext,
	"onCleanup" | "settings" | "channel" | "holdFocusKeys"
>;
export type SharedContext = Omit<
	PanelContext,
	"reportPresence" | "onKey" | "bar" | "resetScroll"
> & {
	focus?: PanelFocus;
	terminal: Accessor<{ width: number; height: number }>;
};

type SlotProps = {
	slot: Slot;
	parentDirection: Direction;
	inContent?: boolean;
	modal?: boolean;
	onModalEscape?(): void;
	joinedAt?: () => number | undefined;
	panels: ReadonlyMap<string, readonly PlacedModule[]>;
	context: SharedContext;
};

export const panelIdPrefix = "panel:";

// why: the Bottom line has no dividers, so its Modules are set apart by space alone.
const barGap = 4;

// why: a Panel keeps a cell on every side for its dividers and title, and a blank column keeps text off its left divider; a Modal floats, so it gets a row and a column more of air on each side.
const panelFrame = { padding: 1, paddingLeft: 2 };
const modalFrame = {
	paddingTop: 3,
	paddingBottom: 1,
	paddingLeft: 3,
	paddingRight: 2,
};
export const modalFrameRows = modalFrame.paddingTop + modalFrame.paddingBottom;
export const modalContentInsets = {
	top: modalFrame.paddingTop,
	bottom: modalFrame.paddingBottom,
	left: modalFrame.paddingLeft,
	right: modalFrame.paddingRight,
} as const;
// why: a Modal whose Module has no title (a Dialog, a subagent's window) gives its first row the title row under the heavy line, so the Module draws its own heading there and can wrap it; the heading keeps clear of the hint at the row's right end.
const untitledPaddingTop = 1;
const modalHint = "esc";
const scrollbarGutter = 2;
export const modalHintColumns = modalHint.length + 1;
export const untitledModalFrameRows =
	untitledPaddingTop + modalFrame.paddingBottom;
export const modalFrameColumns =
	modalFrame.paddingLeft + modalFrame.paddingRight + scrollbarGutter;

export function SlotView(props: SlotProps) {
	const slot = props.slot;
	const { focus, terminal, ...shared } = props.context;
	const sizing = sizeStyle(
		slot,
		props.parentDirection,
		props.inContent ?? false,
	);
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
							onModalEscape={props.onModalEscape}
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
	const title = () =>
		focused()
			? (slot.title ?? slot.id)
			: props.modal
				? entries[0]?.placed.module.title
				: undefined;
	const bar = slot.bar ?? false;
	// why: in live Modals the scrollbar sits to the right of the esc hint.
	const outsideModalScrollbar =
		props.modal === true &&
		entries.some((entry) => entry.placed.module.followsOutput);
	const frame = bar
		? {
				id: `${panelIdPrefix}${slot.id}`,
				paddingX: 1,
				columnGap: barGap,
				get backgroundColor() {
					return shared.theme.bar;
				},
			}
		: props.modal
			? {
					...modalFrame,
					paddingTop: title() ? modalFrame.paddingTop : untitledPaddingTop,
					paddingRight: outsideModalScrollbar
						? modalFrame.paddingRight - 1
						: modalFrame.paddingRight,
					onMouseDown(this: Renderable, event: MouseEvent) {
						const x = event.x - this.screenX;
						const start = sheetHintOffset(this.width, modalHint);
						if (
							event.button === 0 &&
							event.y === this.screenY + 1 &&
							x >= start &&
							x < start + modalHint.length
						) {
							event.preventDefault();
							event.stopPropagation();
							props.onModalEscape?.();
						}
					},
					renderBefore: paintSheet(() => ({
						fill: shared.theme.surface,
						rule: shared.theme.text,
						title: title(),
						titleColor: shared.theme.accent,
						hint: modalHint,
						hintColor: shared.theme.faint,
					})),
				}
			: {
					...panelFrame,
					id: `${panelIdPrefix}${slot.id}`,
					renderBefore: paintPanel(() => ({
						fill: shared.theme.surface,
						rule: shared.theme.border,
						heavyRule: shared.theme.text,
						title: title(),
						titleColor: shared.theme.signal,
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
	const smoothScroll = createSmoothScroll(shared.animate);
	onCleanup(smoothScroll.cancel);
	const jumpHint = () => {
		const shortcut = shared.keybindings().effective["chat.bottom"]?.[0];
		if (!shortcut) return "jump to bottom";
		const formatted = formatChord(shortcut);
		return formatted === "ctrl+end"
			? "CTRL+End: jump to bottom"
			: `${formatted}: jump to bottom`;
	};
	const moduleView = (entry: (typeof entries)[number]) => (
		<box
			visible={shown(entry)}
			minHeight={entry.placed.module.minHeight}
			{...(entry.placed.module.grow && slot.direction === "row"
				? { flexGrow: 1, flexBasis: 0 }
				: {})}
		>
			<ModuleView
				placed={entry.placed}
				context={{
					...shared,
					bar,
					reportPresence: entry.setPresence,
					onKey: (handler) => entry.keyHandlers.push(handler),
					holdFocusKeys: (active) => focus?.hold(active),
					resetScroll: () => {
						if (!(element instanceof ScrollBoxRenderable)) return;
						smoothScroll.cancel();
						element.scrollTo(0);
					},
				}}
			/>
		</box>
	);
	const modules = <For each={entries}>{(entry) => moduleView(entry)}</For>;
	if (slot.size === "content" || bar) {
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
	const [awayFromBottom, setAwayFromBottom] = createSignal(false);
	const [footerHeight, setFooterHeight] = createSignal(0);
	// why: a footer Module sits inside the Panel's padding but stays outside the scrollbox, so it remains visible while the content scrolls.
	// why: a header Module stays outside the scrollbox for the same reason, at the top.
	const scrolled = entries.filter(
		(entry) => !entry.placed.module.footer && !entry.placed.module.header,
	);
	const headers = entries.filter(
		(entry) => entry.placed.module.header && !entry.placed.module.footer,
	);
	const footers = entries.filter((entry) => entry.placed.module.footer);
	return (
		<box
			ref={(node: Renderable) => {
				frameElement = node;
			}}
			{...sizing}
			visible={visible() && (props.modal || entries.some(shown))}
			{...frame}
			flexDirection="column"
		>
			<box flexDirection="column" flexShrink={0}>
				<For each={headers}>{(entry) => moduleView(entry)}</For>
			</box>
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
				contentOptions={{
					flexDirection: slot.direction,
					paddingRight: scrollbarGutter + (outsideModalScrollbar ? 1 : 0),
				}}
				// why: keep the scrollbar out of layout so overflow never changes wrapping.
				verticalScrollbarOptions={{
					position: "absolute",
					trackOptions: {
						foregroundColor: shared.theme.border,
						backgroundColor: shared.theme.surface,
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
					right={scrollbarGutter + 1}
					bottom={footerHeight() + 1}
					backgroundColor={shared.theme.jump}
				>
					<text fg={shared.theme.barText}>{jumpHint()}</text>
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
	const track =
		(animate: Animate): Animate =>
		(options) => {
			let finished = false;
			let cancel: () => void = () => {};
			cancel = animate({
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
		};
	return props.placed.module.render({
		...props.context,
		animate: track(props.context.animate),
		animateReveal: track(props.context.animateReveal),
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
		// why: a joined Container shares one terminal row with the Slot above; only padding overlaps, never Module content.
		marginTop: slot.joinAbove && parentDirection === "column" ? -1 : 0,
	};
}
