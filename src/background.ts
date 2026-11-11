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
};

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
	return jobs.filter(
		(job): job is BackgroundJob =>
			typeof job?.id === "string" &&
			typeof job.command === "string" &&
			jobStatuses.includes(job.status),
	);
}
