import type { BackendHealth } from "../../src/backend.ts";
import type { ModuleContext } from "../../src/module.ts";
import { type Selection, selectable } from "./selection.ts";

const STDERR_LINES = 10;

type ExitedHealth = Extract<BackendHealth, { status: "exited" }>;

export function BackendCard(props: {
	context: ModuleContext;
	selection: Selection;
}) {
	const card = () => {
		const health = props.context.pi.backendHealth;
		if (health.status === "not-found") {
			return (
				<text fg={props.context.theme.error}>
					{`Backend command "${health.command}" was not found. Set backend.command in your piu config.json to a program that exists.`}
				</text>
			);
		}
		if (health.status === "exited") {
			return (
				<ExitedCard
					health={health}
					context={props.context}
					selection={props.selection}
				/>
			);
		}
	};
	return <>{card()}</>;
}

function ExitedCard(props: {
	health: ExitedHealth;
	context: ModuleContext;
	selection: Selection;
}) {
	const theme = props.context.theme;
	const restart = selectable(props.selection, () =>
		props.context.actions.restartBackend(),
	);
	const tail = () =>
		props.health.stderrTail
			.trimEnd()
			.split("\n")
			.slice(-STDERR_LINES)
			.join("\n");
	return (
		<box flexDirection="column" border borderColor={theme.error}>
			<text fg={theme.error}>{describeExit(props.health)}</text>
			{tail() && <text fg={theme.muted}>{tail()}</text>}
			<box
				ref={restart.ref}
				border
				alignSelf="flex-start"
				onMouseDown={restart.activate}
			>
				<text fg={theme.accent}>
					{restart.selected() ? "› Restart" : "Restart"}
				</text>
			</box>
		</box>
	);
}

function describeExit(health: ExitedHealth) {
	return health.code !== null
		? `Backend exited with code ${health.code}`
		: `Backend was terminated by ${health.signal}`;
}
