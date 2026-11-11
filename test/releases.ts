export const piLatestUrl = "https://pi.dev/api/latest-version";
export const piReleasesUrl =
	"https://api.github.com/repos/earendil-works/pi/releases?per_page=30";
export const piBoltLatestUrl =
	"https://api.github.com/repos/opensec-git/Pi-Bolt/releases/latest";
export const piBoltReleasesUrl =
	"https://api.github.com/repos/opensec-git/Pi-Bolt/releases?per_page=30";

type Reply = Response | Error | (() => Response | Error | Promise<Response>);

export function json(body: unknown, status = 200) {
	return Response.json(body, { status });
}

export function release(tag: string, body: string) {
	return { tag_name: tag, name: tag, body, draft: false, prerelease: false };
}

export function releaseSources(routes: Record<string, Reply>) {
	const calls: string[] = [];
	const signals: AbortSignal[] = [];
	const fetchRelease = (async (
		input: string | URL | Request,
		init?: RequestInit,
	) => {
		const url = String(input instanceof Request ? input.url : input);
		calls.push(url);
		if (init?.signal) signals.push(init.signal);
		const reply = routes[url];
		const outcome = typeof reply === "function" ? await reply() : reply;
		if (!outcome) throw new TypeError(`unrouted ${url}`);
		if (outcome instanceof Error) throw outcome;
		return outcome.clone();
	}) as typeof fetch;
	return {
		fetch: fetchRelease,
		calls,
		signals,
		async called(url: string, timeoutMs = 4000) {
			const deadline = Date.now() + timeoutMs;
			while (!calls.includes(url)) {
				if (Date.now() > deadline) throw new Error(`${url} was never fetched`);
				await Bun.sleep(10);
			}
		},
	};
}
