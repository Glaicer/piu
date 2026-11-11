import { readFileSync, statSync } from "node:fs";
import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import {
	SUBAGENTS_STATUS_KEY,
	type Subagent,
	type SubagentEntry,
	serializeLog,
	serializeRoster,
	subagentLogKey,
	subagentStatuses,
	transcriptFromSession,
} from "../../src/subagents.ts";

const POLL_MS = 250;
const GRACE_MS = 3000;
// why: the roster entry type and fields are copied from @chthub/pi-subagents 0.5.0 (roster-state.ts, roster.ts); re-read them when that package is upgraded.
const ROSTER_TYPE = "pi-subagents-roster";
const SUBAGENT_TOOL = /^agent_(spawn|send|stop)$/;

type RosterEntry = {
	agentId?: unknown;
	label?: unknown;
	status?: unknown;
	sessionPath?: unknown;
	indent?: unknown;
};

function latestRoster(ctx: ExtensionContext): RosterEntry[] {
	const branch = ctx.sessionManager.getBranch();
	for (let at = branch.length - 1; at >= 0; at--) {
		const entry = branch[at];
		if (entry?.type !== "custom" || entry.customType !== ROSTER_TYPE) continue;
		const entries = (entry.data as { entries?: unknown } | undefined)?.entries;
		return Array.isArray(entries) ? entries : [];
	}
	return [];
}

export default function (pi: ExtensionAPI) {
	const published = new Map<string, string | undefined>();
	const sizes = new Map<string, number>();
	let ctx: ExtensionContext | undefined;
	let timer: ReturnType<typeof setInterval> | undefined;
	let graceUntil = 0;

	function publish(key: string, text: string | undefined) {
		if (published.get(key) === text) return;
		published.set(key, text);
		// why: after the session is replaced the captured context is stale and Pi throws on its use; polling ends instead of crashing the Backend.
		try {
			ctx?.ui.setStatus(key, text);
		} catch {
			stop();
		}
	}

	function stop() {
		clearInterval(timer);
		timer = undefined;
	}

	function readLog(id: string, path: string) {
		let size: number;
		try {
			size = statSync(path).size;
		} catch {
			return;
		}
		if (sizes.get(id) === size) return;
		sizes.set(id, size);
		let entries: SubagentEntry[];
		try {
			entries = transcriptFromSession(readFileSync(path, "utf8"));
		} catch {
			return;
		}
		publish(subagentLogKey(id), serializeLog(entries));
	}

	function refresh() {
		if (!ctx) return;
		const agents: Subagent[] = [];
		try {
			for (const entry of latestRoster(ctx)) {
				if (
					entry.indent !== 0 ||
					typeof entry.agentId !== "string" ||
					typeof entry.label !== "string" ||
					!subagentStatuses.includes(entry.status as Subagent["status"])
				) {
					continue;
				}
				agents.push({
					id: entry.agentId,
					label: entry.label,
					status: entry.status as Subagent["status"],
				});
				if (typeof entry.sessionPath === "string") {
					readLog(entry.agentId, entry.sessionPath);
				}
			}
		} catch {
			stop();
			return;
		}
		publish(
			SUBAGENTS_STATUS_KEY,
			agents.length ? serializeRoster(agents) : undefined,
		);
		const busy = agents.some((agent) => agent.status === "running");
		if (!busy && Date.now() > graceUntil) stop();
	}

	// why: a foreground spawn's result arrives only when the child is done, so the call itself arms the polling; it then runs while any child works and for a moment after each subagent tool call (a send can wake an idle child).
	function arm(context: ExtensionContext) {
		if (!context.hasUI) return;
		ctx = context;
		graceUntil = Date.now() + GRACE_MS;
		timer ??= setInterval(refresh, POLL_MS);
		timer.unref?.();
	}

	pi.on("tool_call", (event, context) => {
		if (SUBAGENT_TOOL.test(event.toolName)) arm(context);
	});
	pi.on("tool_result", (event, context) => {
		if (!SUBAGENT_TOOL.test(event.toolName)) return;
		arm(context);
		refresh();
	});

	pi.on("session_shutdown", () => {
		stop();
		for (const key of published.keys()) publish(key, undefined);
		published.clear();
		sizes.clear();
		ctx = undefined;
	});
}
