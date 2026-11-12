import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import type { Family, Manager } from "./backend-install.ts";
import {
	json,
	piBoltLatestUrl,
	piBoltReleasesUrl,
	piLatestUrl,
	piReleasesUrl,
	release,
	releaseSources,
} from "./releases.ts";

export function updateFixture(
	family: Family,
	manager: Manager,
	options: {
		rotate?: boolean;
		pnpmLayout?: "5" | "v11";
		pnpmRootName?: string;
		pnpmSecondGroup?: boolean;
		holdNativeDownload?: boolean;
		holdRpcStartup?: boolean;
		holdRpcAfterUpdate?: boolean;
		verifyDelaySeconds?: number;
	} = {},
) {
	const dir = mkdtempSync(join(tmpdir(), "piu-updater-"));
	const name = family === "pi" ? "@earendil-works/pi-coding-agent" : "pi-bolt";
	const prefix = join(dir, manager);
	const bin = join(prefix, "bin");
	const tools = join(dir, "tools");
	const specFile = join(dir, "installer.json");
	const driver = join(import.meta.dir, "fixtures/update-installer.ts");
	const quote = (text: string) => `'${text.replaceAll("'", "'\\''")}'`;
	const executable = (path: string, script: string) => {
		mkdirSync(dirname(path), { recursive: true });
		writeFileSync(path, script, { mode: 0o755 });
	};
	const link = (target: string, path: string) => {
		mkdirSync(dirname(path), { recursive: true });
		symlinkSync(relative(dirname(path), target), path);
	};
	const command = join(bin, family);
	const layout = options.pnpmLayout ?? "5";
	const globalRoot = join(prefix, options.pnpmRootName ?? "global");
	const global = join(globalRoot, layout);
	const root =
		manager === "curl"
			? family === "pi"
				? join(prefix, "agent/install")
				: join(prefix, "bolt")
			: manager === "bun"
				? join(prefix, "install/global")
				: manager === "pnpm"
					? globalRoot
					: prefix;
	const modules =
		manager === "pnpm"
			? join(global, ...(layout === "v11" ? ["group"] : []), "node_modules")
			: manager === "bun"
				? join(root, "node_modules")
				: join(prefix, "lib/node_modules");
	const pkg = join(modules, name);
	const file =
		manager === "curl"
			? family === "pi"
				? join(prefix, "agent/bin/pi")
				: join(root, "pi-bolt-linux-x64-jit/pi")
			: join(pkg, "dist/cli.js");
	const invoke = `exec ${quote(process.execPath)} ${quote(driver)} ${quote(specFile)}`;
	const delay = options.verifyDelaySeconds
		? `if grep -Fq 1.0.1 ${quote(join(dir, "version-output"))}; then sleep ${options.verifyDelaySeconds}; fi; `
		: "";
	const native = options.holdNativeDownload
		? `if grep -Fq 1.0.1 ${quote(join(dir, "version-output"))} && [ ! -e ${quote(join(dir, "native-ready"))} ]; then echo $$ >> ${quote(join(dir, "native-starts"))}; echo 'Downloading native build' >&2; while [ -d ${quote(dir)} ] && [ ! -e ${quote(join(dir, "native-release"))} ]; do sleep 0.05; done; touch ${quote(join(dir, "native-ready"))}; fi; `
		: "";
	const rpcWait =
		options.holdRpcStartup || options.holdRpcAfterUpdate
			? `echo $$ > ${quote(join(dir, "rpc-waiting"))}\nwhile [ -d ${quote(dir)} ] && [ ! -e ${quote(join(dir, "rpc-release"))} ]; do sleep 0.05; done\n`
			: "";
	const rpc = options.holdRpcAfterUpdate
		? `if grep -Fq 1.0.1 ${quote(join(dir, "version-output"))}; then\n${rpcWait}fi\n`
		: rpcWait;
	const backend = `#!/bin/sh\nif [ "$1" = update ]; then ${invoke} "$@"; fi\nfor last; do :; done\nif [ "$last" = --version ]; then ${delay}${native}cat ${quote(join(dir, "version-output"))}; exit 0; fi\n${rpc}exec env "$@"\n`;
	executable(file, backend);
	if (manager === "pnpm") {
		executable(
			command,
			`#!/bin/sh\nexec "$(dirname "$0")/${relative(bin, file)}" "$@"\n# cmd-shim-target=${file}\n`,
		);
	} else link(file, command);
	mkdirSync(root, { recursive: true });
	if (manager !== "curl")
		writeFileSync(
			join(pkg, "package.json"),
			JSON.stringify({
				name,
				version: "1.0.0",
				bin: { [family]: "dist/cli.js" },
			}),
		);
	if (manager === "curl" && family === "pi")
		writeFileSync(
			join(root, "managed-install.json"),
			JSON.stringify({
				kind: "pi-managed-install",
				schemaVersion: 1,
				layout: "releases-v1",
			}),
		);
	if (manager === "bun") writeFileSync(join(root, "bun.lock"), "{}");
	if (manager === "pnpm") {
		const project = dirname(modules);
		writeFileSync(
			join(project, "package.json"),
			JSON.stringify({
				dependencies: { [name]: "1.0.0", "neighbor-tool": "2.0.0" },
			}),
		);
		writeFileSync(join(project, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
		if (options.pnpmSecondGroup) {
			const other = join(global, "other-group");
			mkdirSync(other, { recursive: true });
			writeFileSync(
				join(other, "package.json"),
				JSON.stringify({ dependencies: { [name]: "1.0.0" } }),
			);
			writeFileSync(join(other, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
		}
	}
	const expected =
		manager === "npm"
			? [
					"install",
					"-g",
					"--prefix",
					prefix,
					...(family === "pi"
						? ["--ignore-scripts"]
						: ["--allow-scripts=pi-bolt"]),
					`${name}@1.0.1`,
				]
			: manager === "bun"
				? [
						"add",
						"-g",
						...(family === "pi" ? ["--ignore-scripts"] : ["--trust"]),
						`${name}@1.0.1`,
					]
				: manager === "pnpm"
					? [
							"update",
							"-g",
							`--config.global-dir=${root}`,
							`--config.global-bin-dir=${bin}`,
							"--latest",
							name,
						]
					: ["update"];
	for (const tool of ["npm", "bun", "pnpm"]) {
		const probe =
			tool === "pnpm"
				? `if [ "$1" = root ]; then echo ${quote(join(global, ...(layout === "5" ? ["node_modules"] : [])))}; exit 0; fi\n`
				: tool === "bun"
					? `if [ "$1" = pm ] && [ "$2" = ls ]; then echo ${quote(`${root} node_modules (1 installed)`)}; exit 0; fi\nif [ "$1" = pm ] && [ "$2" = bin ]; then echo ${quote(bin)}; exit 0; fi\n`
					: "";
		executable(join(tools, tool), `#!/bin/sh\n${probe}${invoke} "$@"\n`);
	}
	const version = (v: string) =>
		family === "pi"
			? `${v}\n`
			: `1.5.2 (Pi-Bolt ${v}, linux-x64-jit, JIT on)\n`;
	writeFileSync(join(dir, "version-output"), version("1.0.0"));
	const spec = {
		dir,
		root,
		file,
		command,
		manager,
		family,
		expected,
		version: version("1.0.1"),
		rotate: options.rotate ?? false,
		outcome: "success",
	};
	writeFileSync(specFile, JSON.stringify(spec));
	const sources = releaseSources(
		family === "pi"
			? {
					[piLatestUrl]: json({ version: "1.0.1" }),
					[piReleasesUrl]: json([release("v1.0.1", "Verified update note")]),
				}
			: {
					[piBoltLatestUrl]: json({ tag_name: "bolt-v1.0.1" }),
					[piBoltReleasesUrl]: json([
						release("bolt-v1.0.1", "Verified update note"),
					]),
				},
	);
	return {
		dir,
		root,
		file,
		command,
		sources,
		env: {
			PATH: `${tools}:${process.env.PATH}`,
			PIBOLT_VARIANT: "x64-jit",
			HOME: dir,
		},
		setOutcome(outcome: string) {
			writeFileSync(specFile, JSON.stringify({ ...spec, outcome }));
		},
		calls(): { args: string[]; pid: number }[] {
			try {
				return readFileSync(join(dir, "calls.jsonl"), "utf8")
					.trim()
					.split("\n")
					.map((line) => JSON.parse(line));
			} catch {
				return [];
			}
		},
		cleanup() {
			rmSync(dir, { recursive: true, force: true });
		},
	};
}
