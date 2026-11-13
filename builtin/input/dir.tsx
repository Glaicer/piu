import { type ChildProcess, execFile } from "node:child_process";
import { CliRenderEvents, type TextRenderable } from "@opentui/core";
import { useRenderer } from "@opentui/solid";
import { stringWidth } from "bun";
import { createSignal } from "solid-js";
import type { ModuleContext } from "../../src/module.ts";

const graphemes = new Intl.Segmenter();

function tail(text: string, width: number) {
	if (width <= 0) return "";
	if (stringWidth(text) <= width) return text;
	let result = "";
	let used = 1;
	for (const { segment } of [...graphemes.segment(text)].reverse()) {
		used += stringWidth(segment);
		if (used > width) break;
		result = segment + result;
	}
	return `…${result}`;
}

function label(cwd: string, branch: string | undefined, width: number) {
	if (!branch) return tail(cwd, width);
	const full = `${cwd}:${branch}`;
	if (stringWidth(full) <= width || width < 3) return tail(full, width);
	const space = width - 1;
	const branchWidth = Math.min(
		stringWidth(branch),
		Math.max(Math.floor(space / 2), space - stringWidth(cwd)),
	);
	return `${tail(cwd, space - branchWidth)}:${tail(branch, branchWidth)}`;
}

export function Directory(props: { context: ModuleContext }) {
	const { cwd, theme } = props.context;
	const renderer = useRenderer();
	const [branch, setBranch] = createSignal<string>();
	const [width, setWidth] = createSignal(0);
	let element: TextRenderable | undefined;
	const resize = () => {
		if (element) setWidth(element.width);
	};
	renderer.on(CliRenderEvents.FRAME, resize);
	let child: ChildProcess | undefined;
	let disposed = false;
	const refresh = () => {
		if (child) return;
		child = execFile(
			"git",
			["symbolic-ref", "--quiet", "--short", "HEAD"],
			{ cwd, timeout: 2000 },
			(error, stdout) => {
				child = undefined;
				if (!disposed)
					setBranch(error ? undefined : stdout.trimEnd() || undefined);
			},
		);
	};
	refresh();
	const timer = renderer.clock.setInterval(refresh, 1000);
	props.context.onCleanup(() => {
		disposed = true;
		renderer.clock.clearInterval(timer);
		child?.kill();
		renderer.off(CliRenderEvents.FRAME, resize);
	});
	return (
		<box paddingRight={1}>
			<text
				width="100%"
				height={1}
				fg={theme.muted}
				wrapMode="none"
				ref={(node) => {
					element = node;
				}}
			>
				{label(cwd, branch(), width())}
			</text>
		</box>
	);
}
