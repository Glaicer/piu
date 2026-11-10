import type { BackendHealth } from "../../src/backend.ts";
import type { ModuleContext } from "../../src/module.ts";

const STDERR_LINES = 10;

type ExitedHealth = Extract<BackendHealth, { status: "exited" }>;

export function BackendCard(props: { context: ModuleContext }) {
	const card = () => {
		const health = props.context.pi.backendHealth;
		if (health.status === "not-found") {
			return (
				<text fg={props.context.theme.error}>
					{`Backend command "${health.command}" was not found. Set backend.command in config.json to a program that exists.`}
				</text>
			);
		}
		if (health.status === "exited") {
			return <ExitedCard health={health} context={props.context} />;
		}
	};
	return <>{card()}</>;
}

function ExitedCard(props: { health: ExitedHealth; context: ModuleContext }) {
	const theme = props.context.theme;
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
				border
				alignSelf="flex-start"
				onMouseDown={() => props.context.actions.restartBackend()}
			>
				<text fg={theme.accent}>Restart</text>
			</box>
		</box>
	);
}

function describeExit(health: ExitedHealth) {
	return health.code !== null
		? `Backend exited with code ${health.code}`
		: `Backend was terminated by ${health.signal}`;
}
