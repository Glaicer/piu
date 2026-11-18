import { type Renderable, TextAttributes } from "@opentui/core";
import { createEffect, For, Show } from "solid-js";
import {
	CONTEXT_INJECTION_GROUPS,
	type ContextInjection,
	formatTokens,
} from "../../src/context-usage.ts";
import type { ModuleContext } from "../../src/module.ts";
import { scrollIntoView } from "../../src/scroll.ts";
import type { Theme } from "../../src/theme.ts";
import type { ContextModalState } from "./state.ts";

const NOTE =
	"Edits made after piu's hook (later context_with_system handlers, provider payload rewrites) are not shown.";

const NAME_WIDTH = 20;
const TOKENS_WIDTH = 6;
const SOURCE_WIDTH = 25;
const COLUMN_GAP = 4;

const COLUMN_HEADER = ` ${" ".repeat(NAME_WIDTH)} ${"tokens".padStart(TOKENS_WIDTH)}${" ".repeat(COLUMN_GAP)}source`;

const fitLeft = (text: string, width: number) =>
	text.length > width ? `${text.slice(0, width - 1)}…` : text.padEnd(width);
const fitRight = (text: string, width: number) =>
	text.length > width ? `${text.slice(0, width - 1)}…` : text.padStart(width);

type Line =
	| { readonly kind: "group"; readonly label: string; readonly count: number }
	| { readonly kind: "blank" }
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
		if (result.length > 0) result.push({ kind: "blank" });
		result.push({ kind: "group", label: group.label, count: members.length });
		for (const member of members)
			result.push({ kind: "item", item: member.item, index: member.index });
	}
	return result;
}

function InjectionDetail(props: {
	item: () => ContextInjection | undefined;
	theme: Theme;
	onBack: () => void;
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
			<text> </text>
			<box
				alignSelf="flex-start"
				flexShrink={0}
				backgroundColor={props.theme.bar}
				paddingX={1}
				onMouseDown={(event) => {
					event.preventDefault();
					props.onBack();
				}}
			>
				<text fg={props.theme.barText} attributes={TextAttributes.BOLD}>
					Back
				</text>
			</box>
			<text> </text>
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
			<Show when={lines().length > 0}>
				<text fg={props.theme.faint}>{COLUMN_HEADER}</text>
			</Show>
			<For each={lines()}>
				{(line) => {
					if (line.kind === "blank") return <text> </text>;
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
								wrapMode="none"
							>{` ${fitLeft(line.item.name, NAME_WIDTH)}`}</text>
							<text
								fg={selected() ? props.theme.barText : props.theme.text}
								wrapMode="none"
							>{` ${fitRight(formatTokens(line.item.tokens), TOKENS_WIDTH)}`}</text>
							<text
								fg={selected() ? props.theme.barMuted : props.theme.muted}
								wrapMode="none"
							>{`${" ".repeat(COLUMN_GAP)}${fitLeft(originLabel(line.item.origin), SOURCE_WIDTH)}`}</text>
							{line.item.requestOnly && (
								<text
									fg={selected() ? props.theme.barText : props.theme.text}
									wrapMode="none"
								>{` · request only · ${line.item.requestOnly}`}</text>
							)}
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
	return (
		<box flexDirection="column">
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
					<InjectionDetail
						item={state.detail}
						theme={theme}
						onBack={() => state.setDetail(undefined)}
					/>
				</Show>
			</Show>
		</box>
	);
}
