import { join } from "node:path";
import type { BackendConfig } from "./backend.ts";
import {
	type CompileRequest,
	type CompileResult,
	parseCompileRecord,
} from "./compile-protocol.ts";
import { runWorker } from "./worker.ts";

export function compileExtensions(
	options: {
		config: BackendConfig;
		cwd: string;
		home: string;
		env: NodeJS.ProcessEnv;
	},
	progress: (message: string) => void,
): Promise<CompileResult & { log: string }> {
	const log = join(options.home, "pi-bolt-compile.log");
	return runWorker<CompileResult>(
		join(import.meta.dir, "compile-worker.ts"),
		{ config: options.config, cwd: options.cwd, log } satisfies CompileRequest,
		{
			cwd: options.cwd,
			env: options.env,
			parse: parseCompileRecord,
			progress,
			name: "compile worker",
		},
	).then((result) => ({ ...result, log }));
}
