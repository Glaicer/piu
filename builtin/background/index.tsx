import { createMemo, For, Show } from "solid-js";
import type { BackgroundJob } from "../../src/background.ts";
import type { Extension, ModuleContext } from "../../src/module.ts";

const MAX_ROWS = 5;

function Processes(props: { context: ModuleContext }) {
	const { pi, theme } = props.context;
	const running = createMemo(() =>
		pi.backgroundJobs.filter((job) => job.status === "running"),
	);
	props.context.reportPresence(() =>
		running().length > 0 ? "shown" : "hidden",
	);
	const shown = (): BackgroundJob[] => running().slice(0, MAX_ROWS);
	const hidden = () => running().length - shown().length;
	return (
		<box flexDirection="column">
			<text
				fg={theme.muted}
			>{`Background processes (${running().length})`}</text>
			<For each={shown()}>
				{(job) => (
					<text wrapMode="none" truncate fg={theme.text}>
						{`${job.id}  running  ${job.command}`}
					</text>
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
