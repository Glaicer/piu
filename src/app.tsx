import { useRenderer } from "@opentui/solid";
import { createEffect, onCleanup } from "solid-js";
import { startBackend } from "./backend.ts";
import { type Config, loadConfig } from "./config.ts";
import { bridgeDialogs } from "./dialogs.tsx";
import { builtinDir, findExtensions, resolvePlacement } from "./extensions.ts";
import { SlotView } from "./layout.tsx";
import { createModals, ModalLayer } from "./modal.tsx";
import type { Command, CommandContext, PlacedModule } from "./module.ts";
import { createPiState } from "./pi-state.ts";
import { defaultTheme } from "./theme.ts";
import { createToasts, ToastLayer } from "./toast.tsx";

export async function createApp(options: {
	configPath: string;
	extensionsDir: string;
	args: string[];
	cwd?: string;
}) {
	const cwd = options.cwd ?? process.cwd();
	const config = loadConfig(options.configPath);
	const folders = findExtensions([builtinDir, options.extensionsDir]);
	const { panels, commands, channelTitles, piExtensions } =
		await resolvePlacement(config, folders);
	return () => (
		<App
			config={config}
			args={[...piExtensions.flatMap((path) => ["-e", path]), ...options.args]}
			channelTitles={channelTitles}
			cwd={cwd}
			panels={panels}
			commands={commands}
		/>
	);
}

function App(props: {
	config: Config;
	args: string[];
	channelTitles: readonly string[];
	cwd: string;
	panels: ReadonlyMap<string, readonly PlacedModule[]>;
	commands: readonly Command[];
}) {
	const toasts = createToasts();
	onCleanup(toasts.dispose);
	const pi = createPiState(
		(extraArgs) =>
			startBackend(
				props.config.backend,
				[...extraArgs, ...props.args],
				props.cwd,
			),
		toasts.show,
		new Set(props.channelTitles),
	);
	onCleanup(pi.dispose);
	const modals = createModals();
	bridgeDialogs(pi, modals);
	const renderer = useRenderer();
	createEffect(() => {
		if (pi.state.title !== null) renderer.setTerminalTitle(pi.state.title);
	});
	const commandContext: CommandContext = {
		pi: pi.state,
		actions: { ...pi.actions, openModal: modals.open, showToast: toasts.show },
		theme: defaultTheme,
	};
	const context = {
		cwd: props.cwd,
		...commandContext,
		commands: props.commands.map((command) => ({
			...command,
			run: () => command.run(commandContext),
		})),
	};
	return (
		<box width="100%" height="100%" backgroundColor={defaultTheme.surface}>
			<SlotView
				slot={props.config.layout}
				parentDirection="column"
				panels={props.panels}
				context={context}
			/>
			<ModalLayer modals={modals} context={context} />
			<ToastLayer toasts={toasts} theme={defaultTheme} />
		</box>
	);
}
