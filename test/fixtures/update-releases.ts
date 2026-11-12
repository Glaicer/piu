import {
	piBoltLatestUrl,
	piBoltReleasesUrl,
	piLatestUrl,
	piReleasesUrl,
} from "../releases.ts";

globalThis.fetch = Object.assign(
	async (input: string | URL | Request) => {
		const url = String(input instanceof Request ? input.url : input);
		if (url === piLatestUrl) return Response.json({ version: "1.0.1" });
		if (url === piBoltLatestUrl)
			return Response.json({ tag_name: "bolt-v1.0.1" });
		if (url === piReleasesUrl || url === piBoltReleasesUrl)
			return Response.json([
				{
					tag_name: url === piReleasesUrl ? "v1.0.1" : "bolt-v1.0.1",
					body: "Verified update note",
				},
			]);
		throw new Error(`Unexpected network request: ${url}`);
	},
	{ preconnect: fetch.preconnect },
);
