import { type BoxRenderable, TextAttributes } from "@opentui/core";
import { createSignal, For, onMount, Show } from "solid-js";
import { requiredExtension } from "./config.ts";
import type {
	AgenticRow,
	ExtensionInventory,
	InterfaceRow,
} from "./extension-inventory.ts";
import {
	canDeleteExtension,
	type ExtensionEdit,
	type ExtensionTarget,
	extensionDeletionLabel,
	extensionEditKey,
} from "./extension-settings.ts";
import { moduleModal } from "./modal.tsx";
import type { CommandContext, SettingsTab } from "./module.ts";
import { Picker, PickerLink } from "./picker.tsx";
import { scrollBoxOf, scrollIntoView } from "./scroll.ts";
import type { Theme } from "./theme.ts";

type Row = {
	target: ExtensionTarget;
	enabled: boolean;
	description?: string;
	origin: string;
	notes: string[];
	unavailable?: boolean;
	required?: boolean;
};
type Options = {
	read(): ExtensionInventory;
	save(
		edits: readonly ExtensionEdit[],
		committed: (edit: ExtensionEdit) => void,
	): Promise<void>;
	compile(): Promise<string | undefined>;
};

const takesEffect = "Changes take effect after Restart.";

export function createExtensionsDraft(
	context: CommandContext,
	options: Options,
) {
	const [edits, setEdits] = createSignal<ReadonlyMap<string, ExtensionEdit>>(
		new Map(),
	);
	const [busy, setBusy] = createSignal(false);
	const [selected, setSelected] = createSignal<string>();
	const [revision, refresh] = createSignal(0);
	const dirty = () => edits().size > 0;
	const edit = (
		target: ExtensionTarget,
		operation?: ExtensionEdit["operation"],
	) => {
		setEdits((previous) => {
			const next = new Map(previous);
			const id = extensionEditKey(target);
			if (operation) next.set(id, { target, operation });
			else next.delete(id);
			return next;
		});
	};
	const restart = (warnings: string[]) => {
		const running = context.pi.working
			? ["A turn is running; Restart interrupts it."]
			: [];
		if (warnings.length === 0 && running.length === 0)
			return context.actions.restart();
		confirm(
			context,
			"Restart to apply Extensions?",
			[...warnings, ...running],
			"Restart now",
			(confirmed) =>
				confirmed
					? context.actions.restart()
					: context.actions.showToast(`Saved Extensions. ${takesEffect}`),
			running.length === 0,
		);
	};
	const persist = async () => {
		setBusy(true);
		let changed = false;
		let agentic = false;
		let failed = false;
		try {
			await options.save([...edits().values()], ({ target }) => {
				changed = true;
				if (target.kind !== "interface") agentic = true;
				edit(target);
			});
		} catch (error) {
			failed = true;
			context.actions.showToast(
				`Could not save Extensions: ${String(error)}${changed ? " Saved changes take effect after Restart." : ""}`,
				"error",
			);
		} finally {
			if (changed) refresh((n) => n + 1);
		}
		try {
			if (!changed || failed) return;
			const warning = agentic ? await options.compile() : undefined;
			restart(warning ? [warning] : []);
		} finally {
			setBusy(false);
		}
	};
	const save = () => {
		if (busy() || !dirty()) return;
		const deletions = [...edits().values()].filter(
			({ operation }) => operation === "delete",
		);
		if (deletions.length)
			confirm(
				context,
				"Delete extensions?",
				deletions.map(({ target }) => extensionDeletionLabel(target)),
				"Delete and save",
				(confirmed) => {
					if (confirmed) void persist();
				},
			);
		else void persist();
	};
	const tab: SettingsTab = {
		title: "Extensions",
		render: () => {
			const view = () => {
				revision();
				return options.read();
			};
			const read = () => {
				try {
					return { inventory: view() };
				} catch (error) {
					return { error: String(error) };
				}
			};
			return (
				<Show when={read()} keyed>
					{(result: { inventory?: ExtensionInventory; error?: string }) => (
						<Show
							when={result.inventory}
							keyed
							fallback={<text fg={context.theme.error}>{result.error}</text>}
						>
							{(inventory: ExtensionInventory) => (
								<ExtensionsView
									context={context}
									view={inventory}
									busy={busy}
									selected={selected}
									select={setSelected}
									operation={(target) =>
										edits().get(extensionEditKey(target))?.operation
									}
									edit={edit}
								/>
							)}
						</Show>
					)}
				</Show>
			);
		},
	};
	return {
		tab,
		save,
		footer: () => (
			<PickerLink
				context={context}
				label={
					busy() ? "Saving…" : dirty() ? "Save [ctrl+s] *" : "Save [ctrl+s]"
				}
				onPress={save}
			/>
		),
		dismiss(close: () => void) {
			if (busy()) return false;
			if (!dirty()) return;
			confirm(
				context,
				"Discard unsaved Extension changes?",
				[],
				"Discard changes",
				(confirmed) => {
					if (confirmed) close();
				},
			);
			return false;
		},
	};
}

function confirm(
	context: CommandContext,
	title: string,
	lines: string[],
	accept: string,
	onPick: (confirmed: boolean) => void,
	acceptByDefault = false,
) {
	const close = context.actions.openModal(
		moduleModal(
			{
				id: "confirm-extension-changes",
				title,
				render: () => (
					<box flexDirection="column">
						<Picker
							theme={context.theme}
							items={[
								{ label: "Cancel", value: false },
								{ label: accept, value: true },
							]}
							selected={acceptByDefault ? 1 : 0}
							onPick={(confirmed) => {
								close();
								onPick(confirmed);
							}}
						/>
						<For each={lines}>
							{(line) => (
								<text
									fg={context.theme.muted}
									wrapMode="word"
								>{` ${line}`}</text>
							)}
						</For>
					</box>
				),
			},
			{ width: "65%", height: lines.length ? "65%" : 8 },
		),
	);
}

export const extensionListId = "settings-extension-list";
export const extensionDetailsId = "settings-extension-details";

function ExtensionsView(props: {
	context: CommandContext;
	view: ExtensionInventory;
	busy(): boolean;
	selected(): string | undefined;
	select(key: string): void;
	operation(target: ExtensionTarget): ExtensionEdit["operation"] | undefined;
	edit(target: ExtensionTarget, operation?: ExtensionEdit["operation"]): void;
}) {
	const { theme } = props.context;
	const { view } = props;
	const agentic = view.agentic.map((row) => agenticItem(row, view.agentic));
	const builtin = view.builtin.map((row) => interfaceItem(row, false));
	const personal = view.external.map((row) => interfaceItem(row, true));
	const items = [...agentic, ...builtin, ...personal];
	const index = () =>
		Math.max(
			0,
			items.findIndex(
				({ target }) => extensionEditKey(target) === props.selected(),
			),
		);
	const setIndex = (at: number) => {
		const row = items[at];
		if (row) props.select(extensionEditKey(row.target));
	};
	const nameWidth = Math.min(
		40,
		Math.max(16, ...items.map(({ target }) => target.name.length + 6)),
	);
	let list: BoxRenderable;
	let details: BoxRenderable | undefined;
	const rows: BoxRenderable[] = [];
	onMount(() => list.focus());
	const operation = (row: Row) => props.operation(row.target);
	const enabled = (row: Row) =>
		operation(row) === "enable" ||
		(operation(row) !== "disable" && row.enabled);
	const toggle = (row: Row) => {
		if (props.busy() || row.required || row.unavailable) return;
		props.edit(
			row.target,
			operation(row) ? undefined : row.enabled ? "disable" : "enable",
		);
	};
	const remove = (row: Row) => {
		if (props.busy() || !canDeleteExtension(row.target)) return;
		props.edit(row.target, operation(row) === "delete" ? undefined : "delete");
	};
	const mark = (row: Row) =>
		operation(row) === "delete"
			? { glyph: "✕", color: theme.error }
			: enabled(row)
				? { glyph: "●", color: row.unavailable ? theme.error : theme.success }
				: { glyph: "○", color: row.unavailable ? theme.error : theme.faint };
	const group = (groupItems: Row[]) => (
		<For
			each={groupItems}
			fallback={
				<text fg={theme.muted} paddingLeft={2}>
					None
				</text>
			}
		>
			{(row) => {
				const at = items.indexOf(row);
				const selected = () => at === index();
				return (
					<box
						ref={(node: BoxRenderable) => {
							rows[at] = node;
						}}
						flexDirection="row"
						flexShrink={0}
						paddingLeft={2}
						gap={1}
						backgroundColor={selected() ? theme.bar : undefined}
						onMouseDown={(event) => {
							event.preventDefault();
							setIndex(at);
							list.focus();
						}}
					>
						<text fg={mark(row).color}>{mark(row).glyph}</text>
						<text
							flexShrink={1}
							wrapMode="none"
							truncate
							fg={
								selected()
									? theme.barText
									: enabled(row) && operation(row) !== "delete"
										? theme.text
										: theme.muted
							}
						>
							{`${row.target.name}${operation(row) ? " *" : ""}`}
						</text>
					</box>
				);
			}}
		</For>
	);
	const card = (row: Row) => {
		const state = () =>
			!operation(row) && row.target.kind !== "interface"
				? row.target.state
				: enabled(row)
					? "enabled"
					: "disabled";
		const flags = () =>
			[
				...(row.required ? ["(required)"] : []),
				...(operation(row) === "delete"
					? ["* pending deletion"]
					: operation(row)
						? ["* changed"]
						: []),
			].join("   ");
		return (
			<box flexDirection="column" gap={1}>
				<box flexDirection="column">
					<text fg={theme.text} attributes={TextAttributes.BOLD}>
						{row.target.name}
					</text>
					<Show when={row.description}>
						<text fg={theme.text} wrapMode="word">
							{row.description}
						</text>
					</Show>
					<text fg={theme.muted} wrapMode="char">
						{row.origin}
					</text>
					<box flexDirection="row" gap={3}>
						<text fg={mark(row).color}>{state()}</text>
						<Show when={flags()}>
							<text fg={operation(row) ? theme.warning : theme.muted}>
								{flags()}
							</text>
						</Show>
					</box>
					<Show when={row.notes.length > 0}>
						<text fg={theme.muted}>{row.notes.join("   ")}</text>
					</Show>
				</box>
				<box flexDirection="row" gap={2}>
					<Show when={!row.required && !row.unavailable}>
						<PickerLink
							context={props.context}
							label={`${enabled(row) ? "Disable" : "Enable"}${row.target.kind === "package" ? " package" : ""}`}
							onPress={() => toggle(row)}
						/>
					</Show>
					<Show when={canDeleteExtension(row.target)}>
						<PickerLink
							context={props.context}
							color={theme.error}
							label={operation(row) === "delete" ? "Undo delete" : "Delete"}
							onPress={() => remove(row)}
						/>
					</Show>
				</box>
			</box>
		);
	};
	return (
		<box flexDirection="column" marginTop={1}>
			<Heading theme={theme} label="Agentic" />
			<Show when={view.agenticError}>
				<text fg={theme.error} wrapMode="word" paddingLeft={1}>
					{view.agenticError}
				</text>
			</Show>
			<box
				flexDirection="row"
				gap={3}
				renderBefore={() => {
					// why: the tab scrolls as one box inside the Modal, so the details follow its scroll offset to stay beside whichever rows are in view.
					const top = scrollBoxOf(list)?.scrollTop ?? 0;
					if (details && details.translateY !== top) details.translateY = top;
				}}
			>
				<box
					id={extensionListId}
					ref={(node: BoxRenderable) => {
						list = node;
					}}
					focusable
					flexDirection="column"
					width={nameWidth}
					flexShrink={0}
					onKeyDown={(event) => {
						if (event.ctrl || event.meta || event.shift) return;
						if (event.name === "up" || event.name === "down") {
							setIndex(
								Math.max(
									0,
									Math.min(
										items.length - 1,
										index() + (event.name === "up" ? -1 : 1),
									),
								),
							);
							scrollIntoView(rows[index()]);
						} else {
							const row = items[index()];
							if (!row) return;
							if (event.name === "space" || event.name === "return")
								toggle(row);
							else if (event.name === "delete") remove(row);
							else return;
						}
						event.preventDefault();
					}}
				>
					{group(agentic)}
					<Heading theme={theme} label="Interface" margin />
					<Heading theme={theme} label="Builtin extensions" small />
					{group(builtin)}
					<Heading theme={theme} label="External extensions" small />
					{group(personal)}
				</box>
				<box
					id={extensionDetailsId}
					ref={(node: BoxRenderable) => {
						details = node;
					}}
					flexDirection="column"
					flexGrow={1}
					flexShrink={1}
				>
					<Show when={items[index()]} keyed>
						{(row: Row) => card(row)}
					</Show>
				</box>
			</box>
		</box>
	);
}

function Heading(props: {
	theme: Theme;
	label: string;
	margin?: boolean;
	small?: boolean;
}) {
	return (
		<text
			fg={props.theme.faint}
			attributes={TextAttributes.BOLD}
			paddingLeft={props.small ? 2 : 1}
			marginTop={props.margin ? 1 : 0}
		>
			{props.label}
		</text>
	);
}

function agenticItem(row: AgenticRow, rows: readonly AgenticRow[]): Row {
	const origin =
		row.kind === "file"
			? `file: ${row.path}`
			: row.kind === "package"
				? `package: ${row.source}`
				: "builtin";
	const enabled =
		row.kind === "package"
			? rows.some(
					(other) =>
						other.kind === "package" &&
						other.source === row.source &&
						other.state === "enabled",
				)
			: row.state === "enabled";
	return {
		target: row,
		enabled,
		unavailable: row.state === "unavailable",
		origin,
		notes: [],
	};
}

function interfaceItem(row: InterfaceRow, personal: boolean): Row {
	return {
		target: { kind: "interface", name: row.name, removable: row.removable },
		enabled: row.enabled,
		required: requiredExtension(row.name),
		...(row.description ? { description: row.description } : {}),
		origin: personal ? "personal" : "builtin",
		notes: [
			...(row.hasPiExtension ? ["+ Pi extension"] : []),
			...(!row.placed ? ["not placed"] : []),
		],
	};
}
