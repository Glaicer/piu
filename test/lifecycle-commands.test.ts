import { expect, test } from "bun:test";
import { startPiu } from "./harness.ts";
import { eventually } from "./process.ts";

for (const [alias, query] of [
	["/restart", "/rest"],
	["/q", "/q"],
	["/quit", "/qui"],
	["/exit", "/exi"],
] as const) {
	test(`${alias} is in the slash list`, async () => {
		await using piu = await startPiu({ script: { replies: [] } });
		await piu.waitForFrame((f) => f.includes("faux-1"));

		await piu.mockInput.typeText(query);

		await piu.waitForFrame((f) =>
			f
				.split("\n")
				.some(
					(line) =>
						/^[│┌] /.test(line) && line.slice(2).startsWith(`${alias} `),
				),
		);
	});
}

for (const [first, second] of [
	["/restart", "/restart"],
	["/q", "/restart"],
	["/restart", "/exit"],
] as const) {
	test(`${second} sent while ${first} is closing is ignored`, async () => {
		await using piu = await startPiu({ script: { replies: [] } });
		await piu.waitForFrame((f) => f.includes("faux-1"));

		await piu.mockInput.typeText(`${first}\r${second}\r`);

		await eventually(() => piu.exits.length > 0, "the app to ask to exit");
		await Bun.sleep(300);
		expect(piu.exits).toHaveLength(1);
	});
}
