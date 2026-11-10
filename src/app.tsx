import { onCleanup } from "solid-js";
import { startBackend } from "./backend.ts";
import { type Config, loadConfig } from "./config.ts";
import { builtinDir, findExtensions, resolvePlacement } from "./extensions.ts";
import { SlotView } from "./layout.tsx";
import { createModals, ModalLayer } from "./modal.tsx";
import type { Command, CommandContext, PlacedModule } from "./module.ts";
import { createPiState } from "./pi-state.ts";
import { defaultTheme } from "./theme.ts";

export async function createApp(options: {
	configPath: string;
	extensionsDir: string;
	args: string[];
	cwd?: string;
}) {
	const cwd = options.cwd ?? process.cwd();
	const config = loadConfig(options.configPath);
	const folders = findExtensions([builtinDir, options.extensionsDir]);
	const { panels, commands } = await resolvePlacement(config, folders);
	return () => (
		<App
			config={config}
			args={options.args}
			cwd={cwd}
			panels={panels}
			commands={commands}
		/>
	);
}

function App(props: {
	config: Config;
	args: string[];
	cwd: string;
	panels: ReadonlyMap<string, readonly PlacedModule[]>;
	commands: readonly Command[];
}) {
	const pi = createPiState((extraArgs) =>
		startBackend(
			props.config.backend,
			[...extraArgs, ...props.args],
			props.cwd,
		),
	);
	onCleanup(pi.dispose);
	const modals = createModals();
	const commandContext: CommandContext = {
		pi: pi.state,
		actions: { ...pi.actions, openModal: modals.open },
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
		</box>
	);
}
