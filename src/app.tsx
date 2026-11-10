import { onCleanup } from "solid-js";
import { startBackend } from "./backend.ts";
import type { Config } from "./config.ts";
import { builtinDir, discoverModules, resolvePlacement } from "./extensions.ts";
import { SlotView } from "./layout.tsx";
import type { Module } from "./module.ts";
import { createPiState } from "./pi-state.ts";
import { defaultTheme } from "./theme.ts";

export async function createApp(options: { config: Config; args: string[] }) {
	const modules = await discoverModules(builtinDir);
	const panels = resolvePlacement(options.config.placement, modules);
	return () => (
		<App config={options.config} args={options.args} panels={panels} />
	);
}

function App(props: {
	config: Config;
	args: string[];
	panels: ReadonlyMap<string, readonly Module[]>;
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
