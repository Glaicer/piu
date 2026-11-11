import {
	chmodSync,
	mkdirSync,
	realpathSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";

export type Family = "pi" | "pi-bolt";
export type Manager = "curl" | "npm" | "pnpm" | "bun";

export const families: Family[] = ["pi", "pi-bolt"];
export const managers: Manager[] = ["curl", "npm", "pnpm", "bun"];

const packageName = {
	pi: "@earendil-works/pi-coding-agent",
	"pi-bolt": "pi-bolt",
};

// why: Pi-Bolt reports its own version in parentheses after the Pi it is built on, and the harness never changes the Pi part.
function versionOutput(family: Family, version: string) {
	return family === "pi"
		? `${version}\n`
		: `1.5.2 (Pi-Bolt ${version}, linux-x64, JIT off)\n`;
}

// why: a stand-in for an installed Backend: it prints the version file next to its real file for --version and otherwise becomes the harness's `env <pi> …` command line.
const script = `#!/bin/sh
for last; do :; done
if [ "$last" = "--version" ]; then
  cat "$(dirname "$(readlink -f "$0")")/version-output"
  exit 0
fi
exec env "$@"
`;

export type FakeInstall = {
	command: string;
	file: string;
	setVersion(version: string): void;
};

export function fakeInstall(
	root: string,
	family: Family,
	manager: Manager,
	version: string,
): FakeInstall {
	const name = family;
	const bin = join(root, manager, "bin");
	mkdirSync(bin, { recursive: true });
	let file: string;
	let command: string;
	const payload = (dir: string) => {
		mkdirSync(dir, { recursive: true });
		const path = join(dir, "cli.js");
		writeFileSync(path, script);
		chmodSync(path, 0o755);
		return path;
	};
	const link = (target: string, at: string) =>
		symlinkSync(relative(dirname(at), target), at);
	if (manager === "curl") {
		file = payload(join(root, manager, "share", `${name}-app`));
		command = join(bin, name);
		link(file, command);
	} else if (manager === "pnpm") {
		file = payload(
			join(root, manager, "global/5/.pnpm", packageName[family], "dist"),
		);
		command = join(bin, name);
		writeFileSync(command, `#!/bin/sh\nexec "${file}" "$@"\n`);
		chmodSync(command, 0o755);
	} else {
		const modules =
			manager === "npm"
				? join(root, manager, "lib/node_modules")
				: join(root, manager, "install/global/node_modules");
		file = payload(join(modules, packageName[family], "dist"));
		command = join(bin, name);
		link(file, command);
	}
	const output = join(dirname(file), "version-output");
	const setVersion = (next: string) =>
		writeFileSync(output, versionOutput(family, next));
	setVersion(version);
	return { command, file: realpathSync(file), setVersion };
}
