import type { Renderable } from "@opentui/core";
import { For, Show } from "solid-js";
import {
	CONTEXT_CATEGORIES,
	type ContextUsageSnapshot,
	type ContextUsageView,
	formatTokens,
} from "../../src/context-usage.ts";
import type { ModalRequest } from "../../src/modal.tsx";
import type { Module, ModuleContext } from "../../src/module.ts";
import { scrollKeys } from "../../src/scroll.ts";
import type { ThemeToken } from "../../src/theme.ts";

const PANEL = "context-usage";
const USAGE = "context.usage";
const HINTS = "context.hints";
const LABEL_WIDTH = 17;
const HINTS_TEXT = "↑↓ / PgUp PgDn scroll   esc close";
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
	const source =
		snapshot.source === "last-request" ? "Last request" : "Session estimate";
	const total =
		snapshot.totalSource === "pi"
			? "Total from Pi"
			: "Total estimated from the session";
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
		row(cell(`${source} · ${total}`, "faint")),
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

function UsageContent(props: { context: ModuleContext }) {
	const { context } = props;
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

function UsageFooter(props: { context: ModuleContext }) {
	return (
		<box flexDirection="row" justifyContent="flex-end">
			<text fg={props.context.theme.faint} wrapMode="none" truncate>
				{HINTS_TEXT}
			</text>
		</box>
	);
}

export function contextUsageModal(onDismiss: () => void): ModalRequest {
	const usage: Module = {
		id: USAGE,
		title: "Context",
		render: (context) => <UsageContent context={context} />,
	};
	const hints: Module = {
		id: HINTS,
		footer: true,
		minHeight: 1,
		render: (context) => <UsageFooter context={context} />,
	};
	return {
		slot: { kind: "panel", id: PANEL, direction: "column", size: "rest" },
		panels: new Map([
			[
				PANEL,
				[
					{ id: USAGE, module: usage, settings: {} },
					{ id: HINTS, module: hints, settings: {} },
				],
			],
		]),
		width: "75%",
		height: "75%",
		onDismiss: () => {
			onDismiss();
		},
	};
}
