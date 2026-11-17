import type { KeyEvent } from "@opentui/core";
import { type Accessor, createSignal } from "solid-js";
import {
	CONTEXT_TABS,
	type ContextInjection,
	type ContextTab,
} from "../../src/context-usage.ts";

export type ContextModalState = {
	readonly tab: Accessor<ContextTab>;
	setTab(tab: ContextTab): void;
	readonly selected: Accessor<number>;
	setSelected(index: number): void;
	readonly detail: Accessor<ContextInjection | undefined>;
	setDetail(item: ContextInjection | undefined): void;
};

export function createContextModalState(tab: ContextTab): ContextModalState {
	const [current, setCurrent] = createSignal(tab);
	const [selected, setSelected] = createSignal(0);
	const [detail, setDetailItem] = createSignal<ContextInjection>();
	return {
		tab: current,
		setTab(next) {
			setDetailItem(undefined);
			setCurrent(next);
		},
		selected,
		setSelected,
		detail,
		// why: the transcript is replaced on every new request, so an open text keeps its own copy.
		setDetail(item) {
			setDetailItem(item ? { ...item } : undefined);
		},
	};
}

export function switchTabKey(
	event: KeyEvent,
	state: ContextModalState,
): boolean {
	if (event.name !== "left" && event.name !== "right") return false;
	const index = CONTEXT_TABS.indexOf(state.tab());
	const step = event.name === "right" ? 1 : -1;
	const next =
		CONTEXT_TABS[(index + step + CONTEXT_TABS.length) % CONTEXT_TABS.length] ??
		"usage";
	event.preventDefault();
	state.setTab(next);
	return true;
}
