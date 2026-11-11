import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import {
	BACKGROUND_STATUS_KEY,
	type BackgroundJob,
	jobStatuses,
	serializeJobs,
} from "../../src/background.ts";

const POLL_MS = 250;
const KEPT_JOBS = 50;

// why: the sidecar is the only place the installed @pify/shell-background says when a job really ended; its folder name and session-id key are copied from version 0.7.0.
function sidecarPath(ctx: ExtensionContext, id: string) {
	const key = ctx.sessionManager
		.getSessionId()
		.replace(/[^A-Za-z0-9_-]/g, "_")
		.slice(0, 40);
	return join(tmpdir(), "pify-shell-bg", key, `${id}.json`);
}

function readJob(path: string, id: string): BackgroundJob | undefined {
	try {
		const raw = JSON.parse(readFileSync(path, "utf8"));
		return typeof raw.command === "string" && jobStatuses.includes(raw.status)
			? { id, command: raw.command, status: raw.status }
			: undefined;
	} catch {
		return undefined;
	}
}

export default function (pi: ExtensionAPI) {
	const jobs = new Map<string, { job: BackgroundJob; path: string }>();
	let ui: ExtensionContext["ui"] | undefined;
	let timer: ReturnType<typeof setInterval> | undefined;
	let published: string | undefined;

	function stop() {
		clearInterval(timer);
		timer = undefined;
	}

	function publish() {
		const text = jobs.size
			? serializeJobs([...jobs.values()].map(({ job }) => job))
			: undefined;
		if (text === published) return;
		published = text;
		try {
			ui?.setStatus(BACKGROUND_STATUS_KEY, text);
		} catch {
			stop();
		}
	}

	function refresh() {
		for (const [id, entry] of jobs) {
			if (entry.job.status !== "running") continue;
			const job = readJob(entry.path, id) ?? {
				...entry.job,
				status: "unknown",
			};
			jobs.set(id, { ...entry, job });
		}
		publish();
		if (![...jobs.values()].some(({ job }) => job.status === "running")) {
			stop();
		}
	}

	// why: only a call that has handed its job back to the model counts; a foreground command also has a sidecar, but it blocks the run and is not a background process.
	pi.on("tool_result", (event, ctx) => {
		const details = event.details as
			| { id?: unknown; background?: unknown }
			| undefined;
		if (
			!ctx.hasUI ||
			event.toolName !== "bash" ||
			details?.background !== true ||
			typeof details.id !== "string"
		) {
			return;
		}
		const path = sidecarPath(ctx, details.id);
		const job = readJob(path, details.id);
		if (!job) return;
		ui = ctx.ui;
		jobs.set(job.id, { job, path });
		for (const [id, entry] of jobs) {
			if (jobs.size <= KEPT_JOBS) break;
			if (entry.job.status !== "running") jobs.delete(id);
		}
		publish();
		timer ??= setInterval(refresh, POLL_MS);
		timer.unref?.();
	});

	pi.on("session_shutdown", () => {
		stop();
		jobs.clear();
		publish();
	});
}
