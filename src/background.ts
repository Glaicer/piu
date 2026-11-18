export const BACKGROUND_STATUS_KEY = "opentui:background/jobs";

export const jobStatuses = [
	"running",
	"done",
	"failed",
	"killed",
	"orphaned",
	"unknown",
] as const;

export type BackgroundJob = {
	readonly id: string;
	readonly command: string;
	readonly status: (typeof jobStatuses)[number];
	readonly startedAt?: number;
};

export function parseJob(value: unknown): BackgroundJob | undefined {
	if (!value || typeof value !== "object") return undefined;
	const { id, command, status, startedAt } = value as Partial<BackgroundJob>;
	if (
		typeof id !== "string" ||
		typeof command !== "string" ||
		status === undefined ||
		!jobStatuses.includes(status)
	) {
		return undefined;
	}
	return {
		id,
		command,
		status,
		startedAt:
			typeof startedAt === "number" &&
			Number.isFinite(startedAt) &&
			startedAt > 0
				? startedAt
				: undefined,
	};
}

type Snapshot = { readonly v: 1; readonly jobs: readonly BackgroundJob[] };

export function serializeJobs(jobs: readonly BackgroundJob[]) {
	return JSON.stringify({ v: 1, jobs } satisfies Snapshot);
}

export function parseJobs(text: string | undefined): BackgroundJob[] {
	if (!text) return [];
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		return [];
	}
	const { v, jobs } = (parsed ?? {}) as Partial<Snapshot>;
	if (v !== 1 || !Array.isArray(jobs)) return [];
	return jobs.map(parseJob).filter((job) => job !== undefined);
}
