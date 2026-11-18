import type { Subagent } from "../../src/subagents.ts";
import type { Theme } from "../../src/theme.ts";
import { type Selection, selectable } from "./selection.ts";

export function statusColor(status: Subagent["status"], theme: Theme) {
	if (status === "failed") return theme.error;
	return status === "running" ? theme.signal : theme.faint;
}

export function SubagentCard(props: {
	row: () => SubagentRow | undefined;
	grouped: boolean;
	selection: Selection;
	theme: Theme;
	onOpen(): void;
}) {
	const row = selectable(props.selection, props.onOpen);
	const status = () => props.row()?.agent.status ?? "stopped";
	const name = () => (props.row()?.agent.id ?? "").slice(0, 6).padEnd(6);
	const instruction = () => {
		const chars = [
			...(props.row()?.instruction ?? "").replace(/\s+/g, " ").trim(),
		];
		return chars.length > 50
			? `${chars.slice(0, 49).join("")}…`
			: chars.join("");
	};
	return (
		<box
			ref={row.ref}
			flexDirection="row"
			backgroundColor={row.selected() ? props.theme.selection : undefined}
			paddingX={1}
			marginTop={props.grouped ? 0 : 1}
			onMouseDown={row.activate}
		>
			<text fg={props.theme.surface} bg={props.theme.chip} flexShrink={0}>
				<b>{` ${props.row()?.name.padEnd(11)} `}</b>
			</text>
			<text fg={props.theme.text} flexShrink={0}>
				{row.selected() ? " › " : " ▸ "}
				<b>{`@${name()}`}</b>
				<span style={{ fg: props.theme.muted }}>{" | "}</span>
			</text>
			<text
				fg={props.theme.text}
				flexGrow={1}
				flexShrink={1}
				wrapMode="none"
				truncate
			>
				{instruction()}
			</text>
			<text
				fg={statusColor(status(), props.theme)}
				flexShrink={0}
			>{`  ${status() === "running" ? "◐" : "●"} ${status()}`}</text>
		</box>
	);
}

export type SubagentRow = {
	agent: Subagent;
	instruction: string;
	name: string;
};
