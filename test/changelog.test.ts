import { expect, test } from "bun:test";
import {
	existsSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	type FakeInstall,
	type Family,
	fakeInstall,
} from "./backend-install.ts";
import { startPiu } from "./harness.ts";
import {
	json,
	piBoltLatestUrl,
	piBoltReleasesUrl,
	piLatestUrl,
	piReleasesUrl,
	release,
	releaseSources,
} from "./releases.ts";

const storeFile = "backend-versions.json";

const boltReleases = [
	release("bolt-v1.3.0", "- Future thing"),
	release("bolt-v1.2.1", "### Fixed\n\n- Newest fix"),
	release("bolt-v1.2.0", "### Added\n\n- Middle feature"),
	release("bolt-v1.1.7", "- Older thing"),
	release("bolt-v1.1.6", "- Ancient thing"),
];
const piReleases = [
	release("v1.5.3", "- Pi future note"),
	release("v1.5.2", "- Pi newest note"),
	release("v1.5.1", "- Pi middle note"),
	release("v1.5.0", "- Pi old note"),
];

function routes(family: Family): Record<string, Response> {
	return family === "pi"
		? {
				[piLatestUrl]: json({ version: "1.5.2" }),
				[piReleasesUrl]: json(piReleases),
			}
		: {
				[piBoltLatestUrl]: json({ tag_name: "bolt-v1.2.1" }),
				[piBoltReleasesUrl]: json(boltReleases),
			};
}

const latestUrl = (family: Family) =>
	family === "pi" ? piLatestUrl : piBoltLatestUrl;

function setup() {
	const home = mkdtempSync(join(tmpdir(), "piu-home-"));
	const installs = mkdtempSync(join(tmpdir(), "piu-installs-"));
	return {
		home,
		installs,
		cleanup() {
			rmSync(home, { recursive: true, force: true });
			rmSync(installs, { recursive: true, force: true });
		},
	};
}

async function launch(
	env: ReturnType<typeof setup>,
	install: FakeInstall,
	family: Family,
	options: {
		sources?: ReturnType<typeof releaseSources>;
		args?: string[];
	} = {},
) {
	const sources = options.sources ?? releaseSources(routes(family));
	const piu = await startPiu({
		dir: env.home,
		persistSession: true,
		script: { replies: ["Remembered reply"] },
		backendCommand: install.command,
		updateCheck: sources,
		...(options.args ? { args: options.args } : {}),
	});
	return { piu, sources };
}

// why: a Modal that has opened may not have drawn its Markdown yet, so "no Modal" is proven by what the Modal would do, which is to keep typed keys out of the prompt.
async function settled(
	piu: Awaited<ReturnType<typeof startPiu>>,
	sources: ReturnType<typeof releaseSources>,
	family: Family,
) {
	await sources.called(latestUrl(family));
	await Bun.sleep(50);
	await piu.mockInput.typeText("zzz");
	return piu.waitForFrame((f) => f.includes("zzz"));
}

for (const family of ["pi-bolt", "pi"] as const) {
	const versions =
		family === "pi"
			? { first: "1.5.0", second: "1.5.2", skipped: "Pi middle note" }
			: { first: "1.1.7", second: "1.2.1", skipped: "Middle feature" };
	const newest = family === "pi" ? "Pi newest note" : "Newest fix";
	const oldest = family === "pi" ? "Pi old note" : "Older thing";

	test(`${family}: after an update, the next launch opens a Modal with the changes between the two versions and not again after it is closed`, async () => {
		const env = setup();
		try {
			const install = fakeInstall(env.installs, family, "npm", versions.first);
			{
				const { piu, sources } = await launch(env, install, family);
				await using _ = piu;
				const frame = await settled(piu, sources, family);
				expect(frame).not.toContain(newest);
				expect(existsSync(join(env.home, storeFile))).toBe(true);
			}

			install.setVersion(versions.second);
			{
				const { piu } = await launch(env, install, family);
				await using _ = piu;
				const frame = await piu.waitForFrame((f) => f.includes(newest));
				expect(frame).toContain(versions.skipped);
				expect(frame).toContain(`${versions.first} → ${versions.second}`);
				expect(frame).not.toContain(oldest);
				expect(frame).not.toContain("future");
				expect(frame).not.toContain("Future");
				piu.mockInput.pressEscape();
				await piu.waitForFrame((f) => !f.includes(newest));
			}

			{
				const { piu, sources } = await launch(env, install, family);
				await using _ = piu;
				const frame = await settled(piu, sources, family);
				expect(frame).not.toContain(newest);
			}
		} finally {
			env.cleanup();
		}
	});
}

test("a Modal that was never closed comes back on the next launch", async () => {
	const env = setup();
	try {
		const install = fakeInstall(env.installs, "pi-bolt", "npm", "1.1.7");
		{
			const { piu, sources } = await launch(env, install, "pi-bolt");
			await using _ = piu;
			await settled(piu, sources, "pi-bolt");
		}
		install.setVersion("1.2.1");
		{
			const { piu } = await launch(env, install, "pi-bolt");
			await using _ = piu;
			await piu.waitForFrame((f) => f.includes("Newest fix"));
		}

		const { piu } = await launch(env, install, "pi-bolt");
		await using _ = piu;

		await piu.waitForFrame((f) => f.includes("Newest fix"));
	} finally {
		env.cleanup();
	}
});

test("a continued session opens the Modal too, and shows its conversation behind it", async () => {
	const env = setup();
	try {
		const install = fakeInstall(env.installs, "pi-bolt", "bun", "1.1.7");
		{
			const { piu } = await launch(env, install, "pi-bolt");
			await using _ = piu;
			await piu.mockInput.typeText("Remember me");
			piu.mockInput.pressEnter();
			await piu.waitForFrame((f) => f.includes("Remembered reply"));
		}
		install.setVersion("1.2.1");

		const { piu } = await launch(env, install, "pi-bolt", {
			args: ["--model", "faux/faux-1", "-c"],
		});
		await using _ = piu;

		await piu.waitForFrame((f) => f.includes("Newest fix"));
		piu.mockInput.pressEscape();
		const frame = await piu.waitForFrame((f) => f.includes("> Remember me"));
		expect(frame).not.toContain("Newest fix");
	} finally {
		env.cleanup();
	}
});

test("what one install has seen does not mark another Backend's changes as seen", async () => {
	const env = setup();
	try {
		const pi = fakeInstall(join(env.installs, "pi"), "pi", "npm", "1.5.0");
		const bolt = fakeInstall(
			join(env.installs, "bolt"),
			"pi-bolt",
			"npm",
			"1.1.7",
		);
		for (const [install, family] of [
			[pi, "pi"],
			[bolt, "pi-bolt"],
		] as const) {
			const { piu, sources } = await launch(env, install, family);
			await using _ = piu;
			await settled(piu, sources, family);
		}
		bolt.setVersion("1.2.1");
		pi.setVersion("1.5.2");

		{
			const { piu } = await launch(env, bolt, "pi-bolt");
			await using _ = piu;
			await piu.waitForFrame((f) => f.includes("Newest fix"));
			piu.mockInput.pressEscape();
			await piu.waitForFrame((f) => !f.includes("Newest fix"));
		}

		const { piu } = await launch(env, pi, "pi");
		await using _ = piu;
		const frame = await piu.waitForFrame((f) => f.includes("Pi newest note"));
		expect(frame).not.toContain("Newest fix");
	} finally {
		env.cleanup();
	}
});

test("a first launch and a downgrade show no Modal", async () => {
	const env = setup();
	try {
		const install = fakeInstall(env.installs, "pi-bolt", "npm", "1.2.1");
		{
			const { piu, sources } = await launch(env, install, "pi-bolt");
			await using _ = piu;
			expect(await settled(piu, sources, "pi-bolt")).not.toContain(
				"Newest fix",
			);
		}
		install.setVersion("1.1.7");
		{
			const { piu, sources } = await launch(env, install, "pi-bolt");
			await using _ = piu;
			expect(await settled(piu, sources, "pi-bolt")).not.toContain(
				"Middle feature",
			);
		}
		install.setVersion("1.2.0");
		const { piu } = await launch(env, install, "pi-bolt");
		await using _ = piu;
		const frame = await piu.waitForFrame((f) => f.includes("Middle feature"));
		expect(frame).not.toContain("Older thing");
	} finally {
		env.cleanup();
	}
});

const unavailable: Record<string, Response | Error> = {
	"a network error": new TypeError("offline"),
	"an HTTP error": json(boltReleases, 403),
	"a list without any release of those versions": json([
		release("bolt-v1.0.0", "- Unrelated ancient thing"),
		release("v1.2.1", "- A different product's note"),
	]),
};

for (const [reason, reply] of Object.entries(unavailable)) {
	test(`${reason}: the Modal names the real version and links the official releases, with no invented notes`, async () => {
		const env = setup();
		try {
			const install = fakeInstall(env.installs, "pi-bolt", "npm", "1.1.7");
			{
				const { piu, sources } = await launch(env, install, "pi-bolt");
				await using _ = piu;
				await settled(piu, sources, "pi-bolt");
			}
			install.setVersion("1.2.1");
			const sources = releaseSources({
				...routes("pi-bolt"),
				[piBoltReleasesUrl]: reply,
			});

			const { piu } = await launch(env, install, "pi-bolt", { sources });
			await using _ = piu;

			const frame = await piu.waitForFrame((f) =>
				f.includes("github.com/opensec-git/Pi-Bolt/releases"),
			);
			expect(frame).toContain("1.1.7 → 1.2.1");
			expect(frame).not.toContain("Newest fix");
			expect(frame).not.toContain("different product");
			expect(frame).not.toContain("Unrelated ancient");
		} finally {
			env.cleanup();
		}
	});
}

test("the Modal renders Markdown and scrolls on its own by keyboard and by mouse", async () => {
	const env = setup();
	try {
		const long = Array.from(
			{ length: 80 },
			(_, i) => `- change number ${i}`,
		).join("\n");
		const install = fakeInstall(env.installs, "pi-bolt", "npm", "1.1.7");
		{
			const { piu, sources } = await launch(env, install, "pi-bolt");
			await using _ = piu;
			await settled(piu, sources, "pi-bolt");
		}
		install.setVersion("1.2.1");
		const sources = releaseSources({
			...routes("pi-bolt"),
			[piBoltReleasesUrl]: json([
				release("bolt-v1.2.1", `### Fixed\n\n${long}`),
			]),
		});
		const { piu } = await launch(env, install, "pi-bolt", { sources });
		await using _ = piu;

		const top = await piu.waitForFrame((f) => f.includes("change number 0"));
		expect(top).toContain("Fixed");
		expect(top).not.toContain("###");
		expect(top).not.toContain("change number 79");

		await piu.mockInput.typeText("zzz");
		await piu.renderOnce();
		expect(piu.captureCharFrame()).not.toContain("zzz");

		piu.mockInput.pressKey("\u001b[6~");
		piu.mockInput.pressKey("\u001b[6~");
		const keyboard = await piu.waitForFrame(
			(f) => !f.includes("change number 0\n") && f.includes("change number 2"),
		);
		expect(keyboard).not.toContain("Fixed");
		piu.mockInput.pressKey("HOME");
		await piu.waitForFrame((f) => f.includes("change number 0"));

		const column =
			piu.captureCharFrame().split("\n")[10]?.indexOf("change") ?? 0;
		for (let i = 0; i < 10; i++)
			await piu.mockMouse.scroll(column + 2, 10, "down");
		const wheel = await piu.waitForFrame(
			(f) => !f.includes("change number 0\n"),
		);
		expect(wheel).toMatch(/change number \d+/);

		piu.mockInput.pressEscape();
		await piu.waitForFrame((f) => !f.includes("change number"));
	} finally {
		env.cleanup();
	}
});

test("a damaged entry in the seen-versions file is treated as a first launch", async () => {
	const env = setup();
	try {
		const install = fakeInstall(env.installs, "pi-bolt", "npm", "1.2.1");
		writeFileSync(
			join(env.home, storeFile),
			JSON.stringify({ [`pi-bolt:${install.file}`]: "not a version" }),
		);
		const { piu, sources } = await launch(env, install, "pi-bolt");
		await using _ = piu;

		const frame = await settled(piu, sources, "pi-bolt");

		expect(frame).not.toContain("Newest fix");
		await Bun.sleep(50);
		expect(JSON.parse(readFileSync(join(env.home, storeFile), "utf8"))).toEqual(
			{
				[`pi-bolt:${install.file}`]: "1.2.1",
			},
		);
	} finally {
		env.cleanup();
	}
});
