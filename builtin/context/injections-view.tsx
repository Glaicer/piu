import { type KeyEvent, type Renderable, TextAttributes } from "@opentui/core";
import { createEffect, For, Show } from "solid-js";
import {
	CONTEXT_INJECTION_GROUPS,
	type ContextInjection,
	formatTokens,
} from "../../src/context-usage.ts";
import type { ModuleContext } from "../../src/module.ts";
import { scrollIntoView, scrollKeys } from "../../src/scroll.ts";
import type { Theme } from "../../src/theme.ts";
import { type ContextModalState, switchTabKey } from "./state.ts";

const NOTE =
	"Edits made after piu's hook (later context_with_system handlers, provider payload rewrites) are not shown.";

type Line =
	| { readonly kind: "group"; readonly label: string; readonly count: number }
	| {
			readonly kind: "item";
			readonly item: ContextInjection;
			readonly index: number;
	  };

// why: a bare "extension" means a piu Extension in this project's vocabulary, but these rows belong to Pi's own extensions.
const originLabel = (origin: string) =>
	origin === "extension" ? "Pi extension" : origin;

function listLines(items: readonly ContextInjection[]): Line[] {
	const result: Line[] = [];
	for (const group of CONTEXT_INJECTION_GROUPS) {
		const members = items
			.map((item, index) => ({ item, index }))
			.filter(({ item }) => item.group === group.id);
		if (members.length === 0) continue;
		result.push({ kind: "group", label: group.label, count: members.length });
		for (const member of members)
			result.push({ kind: "item", item: member.item, index: member.index });
	}
	return result;
}

function InjectionDetail(props: {
	item: () => ContextInjection | undefined;
	theme: Theme;
}) {
	const meta = () => {
		const item = props.item();
		if (!item) return "";
		const change = item.requestOnly
			? ` · request only · ${item.requestOnly}`
			: "";
		return `${originLabel(item.origin)} · ${formatTokens(item.tokens)} tokens${change}`;
	};
	return (
		<box flexDirection="column">
			<text fg={props.theme.text} attributes={TextAttributes.BOLD}>
				{props.item()?.name ?? ""}
			</text>
			<text fg={props.theme.muted}>{meta()}</text>
			<text> </text>
			<text fg={props.theme.text}>{props.item()?.text ?? ""}</text>
		</box>
	);
}

function InjectionsList(props: {
	items: readonly ContextInjection[];
	state: ContextModalState;
	theme: Theme;
	rows: Map<number, Renderable>;
}) {
	const lines = () => listLines(props.items);
	return (
		<box flexDirection="column">
			<For each={lines()}>
				{(line) => {
					if (line.kind === "group")
						return (
							<text
								fg={props.theme.faint}
							>{`${line.label} · ${line.count}`}</text>
						);
					const selected = () => props.state.selected() === line.index;
					return (
						<box
							ref={(element: Renderable) => {
								props.rows.set(line.index, element);
							}}
							flexDirection="row"
							backgroundColor={selected() ? props.theme.bar : undefined}
							onMouseMove={() => props.state.setSelected(line.index)}
							onMouseDown={(event) => {
								event.preventDefault();
								props.state.setDetail(line.item);
							}}
						>
							<text
								fg={selected() ? props.theme.barText : props.theme.text}
								attributes={TextAttributes.BOLD}
								flexShrink={1}
								wrapMode="none"
								truncate
							>{` ${line.item.name}`}</text>
							<text
								fg={selected() ? props.theme.barMuted : props.theme.muted}
								flexShrink={0}
								maxWidth="30%"
								wrapMode="none"
								truncate
							>{`  ${originLabel(line.item.origin)}`}</text>
							{line.item.requestOnly && (
								<text
									fg={selected() ? props.theme.barText : props.theme.text}
								>{`  request only · ${line.item.requestOnly}`}</text>
							)}
							<text
								fg={selected() ? props.theme.barText : props.theme.text}
							>{`  ${formatTokens(line.item.tokens).padStart(6)} tokens`}</text>
						</box>
					);
				}}
			</For>
			<text> </text>
			<text fg={props.theme.faint}>{NOTE}</text>
		</box>
	);
}

export function InjectionsContent(props: {
	context: ModuleContext;
	state: ContextModalState;
}) {
	const context = props.context;
	const state = props.state;
	const theme = context.theme;
	const items = () => context.pi.contextInjections?.items ?? [];
	const rows = new Map<number, Renderable>();
	let node: Renderable | undefined;
	createEffect(() => {
		const length = items().length;
		if (state.selected() >= length) state.setSelected(Math.max(0, length - 1));
	});
	createEffect(() => {
		const index = state.selected();
		const item = items()[index];
		// why: a row created by the current data has no ScrollBox parent until the next render, so scrolling now would see the previous tree.
		queueMicrotask(() => {
			if (item) scrollIntoView(rows.get(index));
		});
	});
	const move = (step: number) => {
		const last = items().length - 1;
		state.setSelected(Math.max(0, Math.min(last, state.selected() + step)));
	};
	const onListKey = (event: KeyEvent) => {
		if (event.name === "up" || event.name === "down") {
			event.preventDefault();
			move(event.name === "up" ? -1 : 1);
		} else if (event.name === "pageup" || event.name === "pagedown") {
			event.preventDefault();
			move(event.name === "pageup" ? -10 : 10);
		} else if (event.name === "return") {
			event.preventDefault();
			state.setDetail(items()[state.selected()]);
		}
	};
	return (
		<box
			ref={(element: Renderable) => {
				node = element;
			}}
			flexDirection="column"
			focusable
			focused
			onKeyDown={(event) => {
				if (switchTabKey(event, state)) return;
				if (state.detail()) {
					if (scrollKeys(event, node)) event.preventDefault();
					return;
				}
				onListKey(event);
			}}
		>
			<Show when={context.pi.contextInjections === null}>
				<text fg={theme.muted}> No request to the model yet.</text>
			</Show>
			<Show when={context.pi.contextInjections !== null}>
				<Show
					when={state.detail()}
					fallback={
						<InjectionsList
							items={items()}
							state={state}
							theme={theme}
							rows={rows}
						/>
					}
				>
					<InjectionDetail item={state.detail} theme={theme} />
				</Show>
			</Show>
		</box>
	);
}
