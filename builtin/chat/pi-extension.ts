import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import {
	parseLive,
	SUBAGENTS_STATUS_KEY,
	type Subagent,
	serializeLog,
	serializeRoster,
	subagentLogKey,
	subagentStatuses,
	transcriptFromSession,
	withLive,
} from "../../src/subagents.ts";

const POLL_MS = 250;
const GRACE_MS = 3000;
// why: the roster entry type and fields are copied from @chthub/pi-subagents 0.5.0 (roster-state.ts, roster.ts); re-read them when that package is upgraded.
const ROSTER_TYPE = "pi-subagents-roster";
const SUBAGENT_TOOL = /^agent_(spawn|send|stop)$/;
// why: @chthub/pi-subagents 0.5.0 (child-launch.ts) emits this just before each child launch and revival with a fresh { env, extensions }; the event is copied from its README, so re-read it when the package is upgraded.
const CHILD_LAUNCH_EVENT = "pi-subagents:child-launch:v1";
const REPORTER = fileURLToPath(new URL("./subagent-live.ts", import.meta.url));

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
	const sizes = new Map<string, string>();
	let liveDir: string | undefined;
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

	const stamp = (path: string | undefined) => {
		try {
			const { size, mtimeMs } = statSync(path as string);
			return `${size}:${mtimeMs}`;
		} catch {
			return "-";
		}
	};

	const readText = (path: string | undefined) => {
		try {
			return readFileSync(path as string, "utf8");
		} catch {
			return undefined;
		}
	};

	// why: Pi saves a child's message only when it ends, so the half-streamed one comes from the child's reporter (subagent-live.ts) in liveDir and is dropped once the session holds the message with the same timestamp. The session file does not exist before the first message ends.
	function readLog(id: string, path: string | undefined) {
		const livePath = liveDir && join(liveDir, `${id}.json`);
		const signature = `${stamp(path)}|${stamp(livePath)}`;
		if (sizes.get(id) === signature) return;
		sizes.set(id, signature);
		const session = readText(path);
		const live = parseLive(readText(livePath));
		if (session === undefined && !live) return;
		publish(
			subagentLogKey(id),
			serializeLog(withLive(transcriptFromSession(session ?? ""), live)),
		);
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
				readLog(
					entry.agentId,
					typeof entry.sessionPath === "string" ? entry.sessionPath : undefined,
				);
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

	const unsubscribe = pi.events.on(CHILD_LAUNCH_EVENT, (data) => {
		// why: Pi swallows a listener's exception and the package aborts a launch whose `error` is set; a broken viewer must never stop a subagent, so a failure here leaves the launch as it was.
		try {
			const launch = data as {
				env: Record<string, string>;
				extensions: string[];
			};
			liveDir ??= mkdtempSync(join(tmpdir(), "piu-subagents-live-"));
			launch.env.PIU_SUBAGENT_LIVE_DIR = liveDir;
			launch.extensions.push(REPORTER);
		} catch {}
	});

	// why: a new Backend (Restart, -c, a resumed session) starts with no subagent tool call to arm the polling, so the saved roster is published once at the start.
	pi.on("session_start", (_event, context) => {
		if (!context.hasUI) return;
		ctx = context;
		refresh();
	});
	pi.on("tool_call", (event, context) => {
		if (SUBAGENT_TOOL.test(event.toolName)) arm(context);
	});
	pi.on("tool_result", (event, context) => {
		if (!SUBAGENT_TOOL.test(event.toolName)) return;
		arm(context);
		refresh();
	});

	pi.on("session_shutdown", () => {
		unsubscribe();
		stop();
		if (liveDir) rmSync(liveDir, { recursive: true, force: true });
		liveDir = undefined;
		for (const key of published.keys()) publish(key, undefined);
		published.clear();
		sizes.clear();
		ctx = undefined;
	});
}
