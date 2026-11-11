import { type ChildProcess, spawn } from "node:child_process";
import { mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// why: stand-in for the installed @pify/shell-background 0.7.0; docs/agents/testing.md lists the behaviour it copies.
const DELIVERY_TYPE = "pify-shell-background-result";
const AUTO_MS = Number(process.env.PIU_STANDIN_AUTO_MS ?? 0);
const DELIVER = process.env.PIU_STANDIN_DELIVER !== "0";

type Job = {
	id: string;
	command: string;
	cwd: string;
	pid: number | null;
	hostPid: number;
	status: "running" | "done" | "failed" | "killed" | "orphaned";
	exitCode: number | null;
	signal: string | null;
	logPath: string;
	startedAt: number;
	endedAt: number | null;
	auto: boolean;
	delivered: boolean;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
type Result = {
	content: { type: "text"; text: string }[];
	details: Record<string, unknown>;
	isError?: boolean;
};
const text = (value: string) => [{ type: "text" as const, text: value }];

export default function (pi: ExtensionAPI) {
	const jobs = new Map<string, Job>();
	const children = new Map<string, ChildProcess>();
	const exits = new Map<string, Promise<void>>();
	let dir = "";
	let counter = 0;
	let turnActive = false;

	const persist = (job: Job) => {
		const file = join(dir, `${job.id}.json`);
		writeFileSync(`${file}.tmp`, JSON.stringify(job));
		renameSync(`${file}.tmp`, file);
	};

	function deliver(job: Job) {
		if (!DELIVER || job.delivered) return;
		job.delivered = true;
		persist(job);
		pi.sendMessage(
			{
				customType: DELIVERY_TYPE,
				content: `${job.id} ${job.status}`,
				display: true,
				details: { id: job.id, status: job.status, exitCode: job.exitCode },
			},
			{ deliverAs: "followUp", triggerTurn: true },
		);
	}

	const held = new Set<Job>();
	function drain() {
		for (const job of held) {
			held.delete(job);
			deliver(job);
		}
	}

	function start(command: string, cwd: string) {
		const job: Job = {
			id: `bg-${++counter}`,
			command,
			cwd,
			pid: null,
			hostPid: process.pid,
			status: "running",
			exitCode: null,
			signal: null,
			logPath: join(dir, "logs", `bg-${counter}.log`),
			startedAt: Date.now(),
			endedAt: null,
			auto: false,
			delivered: false,
		};
		jobs.set(job.id, job);
		const child = spawn("sh", ["-c", command], {
			cwd,
			detached: true,
			stdio: "ignore",
		});
		child.unref();
		children.set(job.id, child);
		job.pid = child.pid ?? null;
		persist(job);
		exits.set(
			job.id,
			new Promise<void>((resolve) => {
				child.on("exit", (code, signal) => {
					if (job.status === "running") {
						job.status = signal ? "killed" : code === 0 ? "done" : "failed";
					}
					job.exitCode = code;
					job.signal = signal;
					job.endedAt = Date.now();
					persist(job);
					resolve();
				});
			}),
		);
		return job;
	}

	function backgrounded(job: Job, auto: boolean): Result {
		job.auto = auto;
		persist(job);
		const exit = exits.get(job.id) as Promise<void>;
		void exit.then(() => {
			if (turnActive) held.add(job);
			else deliver(job);
		});
		return {
			content: text(
				`${job.id} ${auto ? "is still running — moved to the background." : "started in the background."}\n  $ ${job.command}`,
			),
			details: {
				id: job.id,
				status: "running",
				background: true,
				auto,
				retryable: true,
				pollRequired: false,
				elapsedMs: Date.now() - job.startedAt,
			},
		};
	}

	pi.on("agent_start", () => {
		turnActive = true;
	});
	pi.on("agent_settled", () => {
		turnActive = false;
		drain();
	});

	pi.on("session_start", (_event, ctx) => {
		dir = join(
			tmpdir(),
			"pify-shell-bg",
			ctx.sessionManager
				.getSessionId()
				.replace(/[^A-Za-z0-9_-]/g, "_")
				.slice(0, 40),
		);
		mkdirSync(join(dir, "logs"), { recursive: true });
	});

	pi.on("session_shutdown", async (event) => {
		if (event.reason === "reload") return;
		for (const job of jobs.values()) {
			if (job.status !== "running") continue;
			job.status = "killed";
			job.endedAt = Date.now();
			persist(job);
			try {
				process.kill(-(job.pid ?? 0), "SIGKILL");
			} catch {}
		}
		rmSync(dir, { recursive: true, force: true });
	});

	pi.registerTool({
		name: "bash",
		label: "Bash",
		description: "Run a shell command; background:true launches it detached.",
		parameters: {
			type: "object",
			properties: {
				command: { type: "string" },
				timeout: { type: "number" },
				background: { type: "boolean" },
			},
			required: ["command"],
		},
		async execute(_id, args, _signal, _onUpdate, ctx): Promise<Result> {
			const { command, background } = args as {
				command: string;
				background?: boolean;
			};
			const job = start(command, ctx.cwd);
			if (background) return backgrounded(job, false);
			const exit = exits.get(job.id) as Promise<void>;
			const outcome = await Promise.race([
				exit.then(() => "exit"),
				AUTO_MS > 0
					? sleep(AUTO_MS).then(() => "auto")
					: new Promise<never>(() => {}),
			]);
			if (outcome === "auto") return backgrounded(job, true);
			job.delivered = true;
			persist(job);
			return {
				content: text(`${job.id} ${job.status} (exit ${job.exitCode})`),
				details: {
					id: job.id,
					status: job.status,
					exitCode: job.exitCode,
					signal: job.signal,
					background: false,
				},
				isError: job.status === "failed",
			};
		},
	});

	pi.registerTool({
		name: "shell_status",
		label: "Background shell status",
		description: "Report a background command by id.",
		parameters: {
			type: "object",
			properties: { id: { type: "string" }, wait: { type: "number" } },
		},
		async execute(_id, args): Promise<Result> {
			const { id, wait } = args as { id?: string; wait?: number };
			const job = id ? jobs.get(id) : undefined;
			if (!job) {
				return {
					content: text(
						[...jobs.values()].map((j) => `${j.id} ${j.status}`).join("\n") ||
							"(none)",
					),
					details: {},
				};
			}
			if (wait && job.status === "running") {
				await Promise.race([exits.get(job.id), sleep(wait * 1000)]);
			}
			if (job.status !== "running") {
				job.delivered = true;
				held.delete(job);
				persist(job);
			}
			return {
				content: text(`${job.id} ${job.status}`),
				details: { id: job.id, status: job.status, exitCode: job.exitCode },
			};
		},
	});

	pi.registerTool({
		name: "shell_kill",
		label: "Kill background shell",
		description: "Terminate a background command by id.",
		parameters: {
			type: "object",
			properties: { id: { type: "string" } },
			required: ["id"],
		},
		async execute(_id, args): Promise<Result> {
			const job = jobs.get((args as { id: string }).id);
			if (!job)
				return { content: text("No such job."), details: {}, isError: true };
			if (job.status === "running") {
				try {
					process.kill(-(job.pid ?? 0), "SIGKILL");
				} catch {}
				await Promise.race([exits.get(job.id), sleep(3500)]);
			}
			return {
				content: text(`${job.id} ${job.status}`),
				details: { id: job.id, status: job.status, exitCode: job.exitCode },
			};
		},
	});
}
