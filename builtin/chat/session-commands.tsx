import type { Command, CommandContext } from "../../src/module.ts";
import { openPicker } from "../../src/picker.tsx";
import { promptRows, type TreeRow } from "./session-tree.ts";
import { listSessions, type SessionSummary } from "./sessions.ts";

async function tree(context: CommandContext) {
	const rows = promptRows((await context.actions.sessionTree()).tree);
	if (rows.length === 0) return;
	openPicker<TreeRow>(context, {
		id: "tree-picker",
		width: 70,
		items: () =>
			rows.map((row) => ({
				label: `${"  ".repeat(row.depth)}${row.text}`.slice(0, 60),
				value: row,
			})),
		selected: () => 0,
		onPick: (row) => void context.actions.fork(row.entryId),
	});
}

async function resume(context: CommandContext) {
	const sessions = await listSessions(context.pi.sessionFile);
	if (sessions.length === 0) return;
	openPicker<SessionSummary>(context, {
		id: "resume-picker",
		width: 70,
		items: () =>
			sessions.map((session) => ({
				label: session.title.slice(0, 50),
				detail: `${session.messages} messages`,
				value: session,
			})),
		selected: () =>
			sessions.findIndex((session) => session.file === context.pi.sessionFile),
		onPick: (session) => void context.actions.switchSession(session.file),
	});
}

export const sessionCommands: readonly Command[] = [
	{
		name: "new",
		description: "Start a new session",
		run: ({ actions }) => void actions.newSession(),
	},
	{
		name: "resume",
		description: "Resume another session",
		run: (context) => void resume(context),
	},
	{
		name: "tree",
		description: "Fork from an earlier prompt",
		run: (context) => void tree(context),
	},
	{
		name: "compact",
		description: "Compact the context",
		run: ({ actions }) => void actions.compact(),
	},
];
