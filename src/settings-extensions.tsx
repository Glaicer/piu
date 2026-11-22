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
import { scrollIntoView } from "./scroll.ts";
import type { Theme } from "./theme.ts";

type Row = {
	target: ExtensionTarget;
	enabled: boolean;
	details(state: string): string;
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

function ExtensionsView(props: {
	context: CommandContext;
	view: ExtensionInventory;
	busy(): boolean;
	operation(target: ExtensionTarget): ExtensionEdit["operation"] | undefined;
	edit(target: ExtensionTarget, operation?: ExtensionEdit["operation"]): void;
}) {
	const { theme } = props.context;
	const { view } = props;
	const agentic = view.agentic.map((row) => agenticItem(row, view.agentic));
	const builtin = view.builtin.map((row) => interfaceItem(row, false));
	const personal = view.external.map((row) => interfaceItem(row, true));
	const items = [...agentic, ...builtin, ...personal];
	const [index, setIndex] = createSignal(0);
	let list: BoxRenderable;
	const rows: BoxRenderable[] = [];
	onMount(() => list.focus());
	const toggle = (row: Row) => {
		if (props.busy() || row.required || row.unavailable) return;
		props.edit(
			row.target,
			props.operation(row.target)
				? undefined
				: row.enabled
					? "disable"
					: "enable",
		);
	};
	const remove = (row: Row) => {
		if (props.busy() || !canDeleteExtension(row.target)) return;
		props.edit(
			row.target,
			props.operation(row.target) === "delete" ? undefined : "delete",
		);
	};
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
				const operation = () => props.operation(row.target);
				const enabled = () =>
					operation() === "enable" ||
					(operation() !== "disable" && row.enabled);
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
						<text
							flexShrink={1}
							wrapMode="word"
							fg={selected() ? theme.barText : theme.text}
						>
							{`${row.target.name}  ${row.details(!operation() && row.target.kind !== "interface" ? row.target.state : enabled() ? "enabled" : "disabled")}${row.required ? "   (required)" : ""}${operation() === "delete" ? "   * pending deletion" : operation() ? "   * changed" : ""}`}
						</text>
						<box flexDirection="row" gap={1} flexShrink={0}>
							<Show when={!row.required && !row.unavailable}>
								<PickerLink
									context={props.context}
									plain
									label={`${enabled() ? "[x]" : "[ ]"}${row.target.kind === "package" ? " package" : ""}`}
									onPress={() => toggle(row)}
								/>
							</Show>
							<Show when={canDeleteExtension(row.target)}>
								<PickerLink
									context={props.context}
									plain
									label={operation() === "delete" ? "Undo delete" : "Delete"}
									onPress={() => remove(row)}
								/>
							</Show>
						</box>
					</box>
				);
			}}
		</For>
	);
	return (
		<box
			ref={(node: BoxRenderable) => {
				list = node;
			}}
			focusable
			flexDirection="column"
			marginTop={1}
			onKeyDown={(event) => {
				if (event.ctrl || event.meta || event.shift) return;
				if (event.name === "up" || event.name === "down") {
					setIndex((at) =>
						Math.max(
							0,
							Math.min(items.length - 1, at + (event.name === "up" ? -1 : 1)),
						),
					);
					scrollIntoView(rows[index()]);
				} else {
					const row = items[index()];
					if (!row) return;
					if (event.name === "space" || event.name === "return") toggle(row);
					else if (event.name === "delete") remove(row);
					else return;
				}
				event.preventDefault();
			}}
		>
			<Heading theme={theme} label="Agentic" />
			<Show when={view.agenticError}>
				<text fg={theme.error} wrapMode="word" paddingLeft={1}>
					{view.agenticError}
				</text>
			</Show>
			{group(agentic)}
			<Heading theme={theme} label="Interface" margin />
			<Heading theme={theme} label="Builtin extensions" small />
			{group(builtin)}
			<Heading theme={theme} label="External extensions" small />
			{group(personal)}
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
		details: (state) => `${origin}   ${state}`,
	};
}

function interfaceItem(row: InterfaceRow, personal: boolean): Row {
	return {
		target: { kind: "interface", name: row.name, removable: row.removable },
		enabled: row.enabled,
		required: requiredExtension(row.name),
		details: (state) =>
			[
				personal ? "personal" : "builtin",
				state,
				...(row.hasPiExtension ? ["+ Pi extension"] : []),
				...(!row.placed ? ["not placed"] : []),
			].join("   "),
	};
}
