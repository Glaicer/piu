import type { Renderable } from "@opentui/core";
import { For, Show } from "solid-js";
import {
	CONTEXT_CATEGORIES,
	CONTEXT_TABS,
	type ContextTab,
	type ContextUsageSnapshot,
	type ContextUsageView,
	formatTokens,
} from "../../src/context-usage.ts";
import type { DismissReason, ModalRequest } from "../../src/modal.tsx";
import type { Module, ModuleContext } from "../../src/module.ts";
import { scrollKeys } from "../../src/scroll.ts";
import { Tabs } from "../../src/tabs.tsx";
import type { ThemeToken } from "../../src/theme.ts";
import { InjectionsContent } from "./injections-view.tsx";
import { type ContextModalState, switchTabKey } from "./state.ts";

const PANEL = "context";
const VIEW = "context.view";
const TABS = "context.tabs";
const HINTS = "context.hints";
const LABEL_WIDTH = 17;
const USAGE_HINTS = "←→ tabs   ↑↓ / PgUp PgDn scroll   esc close";
const LIST_HINTS = "←→ tabs   ↑↓ select   ⏎ open   esc close";
const DETAIL_HINTS = "←→ tabs   ↑↓ / PgUp PgDn scroll   esc back";
const NOTES = [
	"Categories estimate Pi's transcript, not the final provider payload.",
	"Skills counts the catalogue; loaded skill bodies remain Messages.",
	"Other includes the latest response and unassigned overhead.",
];
const IN_PROGRESS = "Request in progress; Pi usage updates after the response.";

type Tone = Extract<ThemeToken, "text" | "muted" | "faint">;
type Cell = { readonly text: string; readonly tone: Tone };
type Row = { readonly cells: readonly Cell[] };

const cell = (text: string, tone: Tone = "text"): Cell => ({ text, tone });
const row = (...cells: Cell[]): Row => ({ cells });
const blank = (): Row => row(cell(" "));

const percent = (tokens: number, window: number) =>
	`${((tokens / window) * 100).toFixed(1)}%`;

const TAB_LABELS: Record<ContextTab, string> = {
	usage: "Usage",
	injections: "Injections",
};

const tabLabel = (tab: ContextTab) => TAB_LABELS[tab];

function breakdown(snapshot: ContextUsageSnapshot): Row[] {
	return CONTEXT_CATEGORIES.map(({ id, label }) => {
		const tokens = snapshot.categories[id];
		return row(
			cell(label.padEnd(LABEL_WIDTH)),
			cell(`${formatTokens(tokens).padStart(6)} tokens`),
			cell(`   ${percent(tokens, snapshot.contextWindow)}`, "muted"),
		);
	});
}

function summary(snapshot: ContextUsageSnapshot): Row[] {
	const free = Math.max(0, snapshot.contextWindow - snapshot.used);
	return [
		row(cell(`Model: ${snapshot.model}`)),
		row(cell(`Window: ${formatTokens(snapshot.contextWindow)} tokens`)),
		row(
			cell(
				`Used: ${formatTokens(snapshot.used)} tokens (${percent(snapshot.used, snapshot.contextWindow)})`,
			),
		),
		row(
			cell(
				`Free: ${formatTokens(free)} tokens (${percent(free, snapshot.contextWindow)})`,
			),
		),
	];
}

function usageRows(view: ContextUsageView | null, working: boolean): Row[] {
	if (view?.kind === "unavailable") return [row(cell(view.reason, "muted"))];
	if (view?.kind !== "ready") return [];
	const snapshot = view.snapshot;
	return [
		...summary(snapshot),
		blank(),
		row(cell("Breakdown · estimated", "faint")),
		...breakdown(snapshot),
		blank(),
		...NOTES.map((note) => row(cell(note, "faint"))),
		...(working ? [row(cell(IN_PROGRESS, "faint"))] : []),
	];
}

function UsageContent(props: {
	context: ModuleContext;
	state: ContextModalState;
}) {
	const { context, state } = props;
	const theme = context.theme;
	const view = () => context.pi.contextUsage;
	const compacting = () =>
		view()?.kind === "compacting" ||
		context.pi.serviceRows.some(
			(row) => row.kind === "compaction" && row.status === "active",
		);
	const rows = () =>
		compacting() ? [] : usageRows(view(), context.pi.working);
	let node: Renderable | undefined;
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
				if (scrollKeys(event, node)) event.preventDefault();
			}}
		>
			<Show when={compacting()}>
				<text fg={theme.text}>Compacting context…</text>
			</Show>
			<For each={rows()}>
				{(line) => (
					<box flexDirection="row">
						<For each={line.cells}>
							{(part) => <text fg={theme[part.tone]}>{part.text}</text>}
						</For>
					</box>
				)}
			</For>
		</box>
	);
}

function ContentView(props: {
	context: ModuleContext;
	state: ContextModalState;
}) {
	return (
		<Show
			when={props.state.tab() === "usage"}
			fallback={
				<InjectionsContent context={props.context} state={props.state} />
			}
		>
			<UsageContent context={props.context} state={props.state} />
		</Show>
	);
}

function Hints(props: { context: ModuleContext; state: ContextModalState }) {
	const text = () => {
		if (props.state.tab() === "usage") return USAGE_HINTS;
		return props.state.detail() ? DETAIL_HINTS : LIST_HINTS;
	};
	return (
		<box flexDirection="row" justifyContent="flex-end">
			<text fg={props.context.theme.faint} wrapMode="none" truncate>
				{text()}
			</text>
		</box>
	);
}

export function contextModal(
	state: ContextModalState,
	onDismiss: () => void,
): ModalRequest {
	const view: Module = {
		id: VIEW,
		title: "Context",
		render: (context) => <ContentView context={context} state={state} />,
	};
	const tabs: Module = {
		id: TABS,
		header: true,
		minHeight: 2,
		render: (context) => (
			<Tabs
				tabs={CONTEXT_TABS}
				active={state.tab()}
				theme={context.theme}
				label={tabLabel}
				onSelect={(tab) => state.setTab(tab)}
			/>
		),
	};
	const hints: Module = {
		id: HINTS,
		footer: true,
		minHeight: 1,
		render: (context) => <Hints context={context} state={state} />,
	};
	return {
		slot: { kind: "panel", id: PANEL, direction: "column", size: "rest" },
		panels: new Map([
			[
				PANEL,
				[
					{ id: VIEW, module: view, settings: {} },
					{ id: TABS, module: tabs, settings: {} },
					{ id: HINTS, module: hints, settings: {} },
				],
			],
		]),
		width: "75%",
		height: "75%",
		onDismiss: (reason: DismissReason) => {
			if (reason === "escape" && state.detail()) {
				state.setDetail(undefined);
				return false;
			}
			onDismiss();
		},
	};
}
