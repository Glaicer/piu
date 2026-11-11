import type { Family } from "./backend-install.ts";

const REQUEST_TIMEOUT_MS = 10_000;

type Source = {
	name: string;
	latestUrl: string;
	releasesUrl: string;
	pageUrl: string;
	tagPrefix: string;
	latestVersion(json: unknown): unknown;
};

export type ReleaseNote = { version: string; body: string };

const sources: Record<Family, Source> = {
	pi: {
		name: "Pi",
		latestUrl: "https://pi.dev/api/latest-version",
		releasesUrl:
			"https://api.github.com/repos/earendil-works/pi/releases?per_page=30",
		pageUrl: "https://github.com/earendil-works/pi/releases",
		tagPrefix: "v",
		latestVersion: (json) => (json as { version?: unknown }).version,
	},
	"pi-bolt": {
		name: "Pi-Bolt",
		latestUrl:
			"https://api.github.com/repos/opensec-git/Pi-Bolt/releases/latest",
		releasesUrl:
			"https://api.github.com/repos/opensec-git/Pi-Bolt/releases?per_page=30",
		pageUrl: "https://github.com/opensec-git/Pi-Bolt/releases",
		tagPrefix: "bolt-v",
		latestVersion: (json) => {
			const tag = (json as { tag_name?: unknown }).tag_name;
			return typeof tag === "string" ? tag.replace(/^bolt-v/, "") : undefined;
		},
	},
};

function versionParts(version: string) {
	const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
	return match?.slice(1).map(Number);
}

export function isVersion(version: string) {
	return versionParts(version) !== undefined;
}

export function compareVersions(left: string, right: string) {
	const a = versionParts(left);
	const b = versionParts(right);
	if (!a || !b) throw new Error(`not a version: ${a ? right : left}`);
	return a.reduce((order, part, i) => order || part - (b[i] ?? 0), 0);
}

export function releaseSource(family: Family, fetchJson: typeof fetch) {
	const source = sources[family];
	const get = async (url: string, signal: AbortSignal) => {
		const response = await fetchJson(url, {
			headers: { accept: "application/json", "user-agent": "piu" },
			signal: AbortSignal.any([
				signal,
				AbortSignal.timeout(REQUEST_TIMEOUT_MS),
			]),
		});
		if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
		return response.json();
	};
	return {
		name: source.name,
		pageUrl: source.pageUrl,
		async latest(signal: AbortSignal) {
			const version = source.latestVersion(await get(source.latestUrl, signal));
			if (typeof version !== "string" || !versionParts(version)) {
				throw new Error(`${source.latestUrl}: no version in the reply`);
			}
			return version;
		},
		async notes(from: string, to: string, signal: AbortSignal) {
			const releases = await get(source.releasesUrl, signal);
			if (!Array.isArray(releases)) throw new Error("no release list");
			return releases
				.flatMap(
					(entry: { tag_name?: unknown; body?: unknown; draft?: unknown }) => {
						const tag = entry.tag_name;
						if (entry.draft || typeof tag !== "string") return [];
						if (!tag.startsWith(source.tagPrefix)) return [];
						const version = tag.slice(source.tagPrefix.length);
						if (!versionParts(version)) return [];
						if (compareVersions(version, from) <= 0) return [];
						if (compareVersions(version, to) > 0) return [];
						const body =
							typeof entry.body === "string" ? entry.body.trim() : "";
						return [{ version, body }];
					},
				)
				.sort((a, b) => compareVersions(b.version, a.version));
		},
	};
}
