import {
	appendFileSync,
	existsSync,
	mkdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// why: stand-in for the installed @chthub/pi-subagents 0.5.0; docs/agents/testing.md lists the behaviour it copies. Children are not processes: the test (test/subagents-control.ts) writes commands to <PIU_STANDIN_SUBAGENTS>/control.jsonl and this file turns them into what the real package leaves behind: roster entries in the parent session and a child session file.
const DIR = process.env.PIU_STANDIN_SUBAGENTS ?? "";
const ROSTER_TYPE = "pi-subagents-roster";
const NAMES = ["max", "zoe", "kai", "ivy", "rex"];

type Status = "running" | "idle" | "done" | "failed" | "stopped";
type Entry = {
	agentId: string;
	label: string;
	status: Status;
	startedAt: number;
	endedAt?: number;
	sessionPath?: string;
	indent: number;
};
type Command =
	| { agent: string; message: Record<string, unknown> }
	| { agent: string; status: Status; output?: string };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const text = (value: string) => [{ type: "text" as const, text: value }];

export default function (pi: ExtensionAPI) {
	const roster = new Map<string, Entry>();
	const waiting = new Map<string, (output: string) => void>();
	const unflushed = new Map<string, string[]>();
	let previous = "";
	let read = 0;
	let counter = 0;
	let timer: ReturnType<typeof setInterval> | undefined;

	const persist = () => {
		const entries = [...roster.values()];
		const serialized = JSON.stringify(entries);
		if (serialized === previous) return;
		previous = serialized;
		pi.appendEntry(ROSTER_TYPE, { entries });
	};

	const sessionLine = (message: Record<string, unknown>) =>
		`${JSON.stringify({
			type: "message",
			id: String(Math.random()).slice(2, 10),
			parentId: null,
			timestamp: new Date().toISOString(),
			message: { timestamp: Date.now(), ...message },
		})}\n`;

	function record(agent: Entry, message: Record<string, unknown>) {
		const path = agent.sessionPath as string;
		const pending = unflushed.get(agent.agentId);
		const line = sessionLine(message);
		if (pending) {
			pending.push(line);
			if (message.role !== "assistant") return;
			writeFileSync(
				path,
				`${JSON.stringify({ type: "session", version: 3, id: agent.agentId })}\n${pending.join("")}`,
			);
			unflushed.delete(agent.agentId);
		} else {
			appendFileSync(path, line);
		}
	}

	function apply(command: Command) {
		const agent = roster.get(command.agent);
		if (!agent) return;
		if ("message" in command) {
			record(agent, command.message);
			return;
		}
		agent.status = command.status;
		if (command.status === "running") agent.endedAt = undefined;
		else if (command.status !== "idle") agent.endedAt ??= Date.now();
		persist();
		if (command.status !== "running") {
			waiting.get(agent.agentId)?.(command.output ?? "");
			waiting.delete(agent.agentId);
		}
	}

	function poll() {
		const file = join(DIR, "control.jsonl");
		if (!existsSync(file)) return;
		const lines = readFileSync(file, "utf8").split("\n").slice(read);
		for (const line of lines.slice(0, -1)) {
			read++;
			apply(JSON.parse(line));
		}
	}

	pi.on("session_start", () => {
		if (!DIR) return;
		mkdirSync(join(DIR, "sessions"), { recursive: true });
		timer ??= setInterval(poll, 20);
		timer.unref?.();
	});
	pi.on("session_shutdown", () => clearInterval(timer));

	pi.registerTool({
		name: "agent_spawn",
		label: "Spawn Agent",
		description: "Start a sub-agent. Returns at once when run_in_background.",
		parameters: {
			type: "object",
			properties: {
				prompt: { type: "string" },
				label: { type: "string" },
				run_in_background: { type: "boolean" },
				persistent: { type: "boolean" },
			},
			required: ["prompt", "label"],
		},
		async execute(_id, args) {
			const { prompt, label, run_in_background } = args as {
				prompt: string;
				label: string;
				run_in_background?: boolean;
			};
			const agentId = NAMES[counter++ % NAMES.length] as string;
			const agent: Entry = {
				agentId,
				label,
				status: "running",
				startedAt: Date.now(),
				indent: 0,
			};
			roster.set(agentId, agent);
			persist();
			agent.sessionPath = join(DIR, "sessions", `${agentId}.jsonl`);
			unflushed.set(agentId, []);
			record(agent, { role: "user", content: prompt });
			await sleep(30);
			persist();
			const details = {
				agentId,
				label,
				runInBackground: run_in_background !== false,
				sessionPath: agent.sessionPath,
				startedAt: agent.startedAt,
			};
			if (run_in_background === false) {
				const output = await new Promise<string>((resolve) =>
					waiting.set(agentId, resolve),
				);
				return { content: text(output), details };
			}
			return {
				content: text(
					`Started background agent @${agentId}. Completion arrives as a notification.`,
				),
				details,
			};
		},
	});

	pi.registerTool({
		name: "agent_send",
		label: "Send to Agent",
		description: "Continue a resident sub-agent.",
		parameters: {
			type: "object",
			properties: { to: { type: "string" }, message: { type: "string" } },
			required: ["to", "message"],
		},
		async execute(_id, args) {
			const { to, message } = args as { to: string; message: string };
			const agent = roster.get(to);
			if (!agent) return { content: text(`no such agent: ${to}`), details: {} };
			agent.status = "running";
			agent.endedAt = undefined;
			persist();
			record(agent, { role: "user", content: message });
			return { content: text(`Delivered to @${to}`), details: {} };
		},
	});
}
