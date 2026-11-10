import { onCleanup } from "solid-js";
import { startBackend } from "./backend.ts";
import { type Config, loadConfig } from "./config.ts";
import { builtinDir, findExtensions, resolvePlacement } from "./extensions.ts";
import { SlotView } from "./layout.tsx";
import type { PlacedModule } from "./module.ts";
import { createPiState } from "./pi-state.ts";
import { defaultTheme } from "./theme.ts";

export async function createApp(options: {
	configPath: string;
	extensionsDir: string;
	args: string[];
}) {
	const config = loadConfig(options.configPath);
	const folders = findExtensions([builtinDir, options.extensionsDir]);
	const panels = await resolvePlacement(config, folders);
	return () => <App config={config} args={options.args} panels={panels} />;
}

function App(props: {
	config: Config;
	args: string[];
	panels: ReadonlyMap<string, readonly PlacedModule[]>;
}) {
	const backend = startBackend(props.config.backend, props.args);
	const pi = createPiState(backend);
	onCleanup(() => {
		pi.dispose();
		backend.stop();
	});
	return (
		<box width="100%" height="100%" backgroundColor={defaultTheme.surface}>
			<SlotView
				slot={props.config.layout}
				parentDirection="column"
				panels={props.panels}
				context={{ pi: pi.state, actions: pi.actions, theme: defaultTheme }}
			/>
		</box>
	);
}
