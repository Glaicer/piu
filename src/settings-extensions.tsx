import { TextAttributes } from "@opentui/core";
import { For, Show } from "solid-js";
import type {
	AgenticRow,
	ExtensionInventory,
	InterfaceRow,
} from "./extension-inventory.ts";
import type { SettingsTab } from "./module.ts";
import type { Theme } from "./theme.ts";

export function createExtensionsTab(
	read: () => ExtensionInventory,
): SettingsTab {
	return {
		title: "Extensions",
		render: (context) => <ExtensionsView theme={context.theme} view={read()} />,
	};
}

function ExtensionsView(props: { theme: Theme; view: ExtensionInventory }) {
	const empty = () =>
		props.view.agentic.length === 0 && !props.view.agenticError;
	return (
		<box flexDirection="column" marginTop={1}>
			<Heading theme={props.theme} label="Agentic" />
			<Show when={props.view.agenticError}>
				<text fg={props.theme.error} wrapMode="word" paddingLeft={1}>
					{props.view.agenticError ?? ""}
				</text>
			</Show>
			<For each={props.view.agentic}>
				{(row) => (
					<Row
						theme={props.theme}
						name={row.name}
						details={agenticDetails(row)}
					/>
				)}
			</For>
			<Show when={empty()}>
				<None theme={props.theme} />
			</Show>
			<Heading theme={props.theme} label="Interface" margin />
			<Heading theme={props.theme} label="Builtin extensions" small />
			<InterfaceRows theme={props.theme} rows={props.view.builtin} />
			<Heading theme={props.theme} label="External extensions" small />
			<InterfaceRows theme={props.theme} rows={props.view.external} personal />
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

function None(props: { theme: Theme }) {
	return (
		<text fg={props.theme.muted} paddingLeft={2}>
			None
		</text>
	);
}

function Row(props: { theme: Theme; name: string; details: string }) {
	return (
		<box flexDirection="column" flexShrink={0} paddingLeft={2}>
			<text wrapMode="word">
				<span style={{ fg: props.theme.text }}>{props.name}</span>
				<span style={{ fg: props.theme.muted }}>{`  ${props.details}`}</span>
			</text>
		</box>
	);
}

function agenticDetails(row: AgenticRow) {
	const origin =
		row.kind === "file"
			? `file: ${row.path}`
			: row.kind === "package"
				? `package: ${row.source}`
				: "builtin";
	return `${origin}   ${row.state}`;
}

function InterfaceRows(props: {
	theme: Theme;
	rows: readonly InterfaceRow[];
	personal?: boolean;
}) {
	return (
		<Show when={props.rows.length > 0} fallback={<None theme={props.theme} />}>
			<For each={props.rows}>
				{(row) => (
					<Row
						theme={props.theme}
						name={row.name}
						details={interfaceDetails(row, props.personal === true)}
					/>
				)}
			</For>
		</Show>
	);
}

function interfaceDetails(row: InterfaceRow, personal: boolean) {
	const parts = [
		personal ? "personal" : "builtin",
		row.enabled ? "enabled" : "disabled",
	];
	if (row.hasPiExtension) parts.push("+ Pi extension");
	return parts.join("   ");
}
