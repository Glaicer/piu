import { useRenderer } from "@opentui/solid";
import {
	createEffect,
	createMemo,
	createSignal,
	For,
	onCleanup,
	Show,
} from "solid-js";
import type { Extension, ModuleContext } from "../../src/module.ts";

const MAX_ROWS = 5;

function elapsed(startedAt: number | undefined, now: number) {
	if (startedAt === undefined) return "—";
	const seconds = Math.max(0, Math.floor((now - startedAt) / 1000));
	const pad = (n: number) => String(n).padStart(2, "0");
	if (seconds < 60) return `${seconds}s`;
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}m ${pad(seconds % 60)}s`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ${pad(minutes % 60)}m`;
	return `${Math.floor(hours / 24)}d ${pad(hours % 24)}h`;
}

function Processes(props: { context: ModuleContext }) {
	const { pi, theme } = props.context;
	const clock = useRenderer().clock;
	const [now, setNow] = createSignal(Date.now());
	const running = createMemo(() =>
		pi.backgroundJobs.filter((job) => job.status === "running"),
	);
	const visible = createMemo(() => running().length > 0);
	props.context.reportPresence(() => (visible() ? "shown" : "hidden"));
	createEffect(() => {
		if (!visible()) return;
		// why: the sidecar uses wall time, while the renderer clock only measures elapsed time.
		const epoch = Date.now() - clock.now();
		const tick = () => setNow(epoch + clock.now());
		tick();
		const timer = clock.setInterval(tick, 1000);
		onCleanup(() => clock.clearInterval(timer));
	});
	const shown = createMemo(() => running().slice(0, MAX_ROWS));
	const idWidth = createMemo(() =>
		Math.max(0, ...shown().map((job) => job.id.length)),
	);
	const hidden = () => running().length - shown().length;
	return (
		<box flexDirection="column" paddingX={1}>
			<text fg={theme.text} wrapMode="none" truncate>
				<b>Background processes</b>
				<span style={{ fg: theme.muted }}>{`  ·  ${running().length}`}</span>
			</text>
			<For each={shown()}>
				{(job) => (
					<box flexDirection="row">
						<text fg={theme.muted} bg={theme.raised} flexShrink={0}>
							<b>{` ${job.id.padEnd(idWidth())} `}</b>
						</text>
						<text
							fg={theme.text}
							flexGrow={1}
							flexShrink={1}
							wrapMode="none"
							truncate
						>
							{`  ${job.command.replace(/\r\n|[\r\n\t]/g, " ")}`}
						</text>
						<text fg={theme.signal} flexShrink={0}>
							{"  ◐ running"}
						</text>
						<text fg={theme.muted} flexShrink={0}>
							{elapsed(job.startedAt, now()).padStart(10)}
						</text>
					</box>
				)}
			</For>
			<Show when={hidden() > 0}>
				<text fg={theme.muted}>{`+${hidden()} more`}</text>
			</Show>
		</box>
	);
}

export default {
	modules: [
		{
			id: "processes",
			render: (context) => <Processes context={context} />,
		},
	],
} satisfies Extension;
