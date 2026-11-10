import type { JSX } from "@opentui/solid";
import type { PiActions, PiState } from "./pi-state.ts";
import type { Theme } from "./theme.ts";

export type ModuleContext = {
	readonly pi: PiState;
	readonly actions: PiActions;
	readonly theme: Theme;
	onCleanup(cleanup: () => void): void;
};

export type Module = {
	readonly id: string;
	readonly title?: string;
	render(context: ModuleContext): JSX.Element;
};

export type Extension = { readonly modules: readonly Module[] };
