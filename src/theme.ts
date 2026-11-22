import type { CliRenderer, ThemeMode } from "@opentui/core";
import { type Accessor, createEffect, createSignal, onCleanup } from "solid-js";
import { createStore, reconcile } from "solid-js/store";

export const themeTokens = [
	"text",
	"muted",
	"accent",
	"success",
	"warning",
	"error",
	"surface",
	"raised",
	"background",
	"selection",
	"secondary",
	"border",
	"signal",
	"faint",
	"code",
	"codeBlock",
	"tertiary",
	"bar",
	"barText",
	"barMuted",
	"chip",
	"jump",
	"agentMode",
] as const;

export type ThemeToken = (typeof themeTokens)[number];

export function isThemeToken(name: string): name is ThemeToken {
	return (themeTokens as readonly string[]).includes(name);
}

export type Theme = Readonly<Record<ThemeToken, string>>;

export type ThemeOverrides = Readonly<Partial<Record<ThemeToken, string>>>;

export const themeModes = ["auto", "light", "dark"] as const;
export type ThemePreference = (typeof themeModes)[number];
export type ThemeConfig = ThemeOverrides & { mode: ThemePreference };

export const darkTheme: Theme = {
	text: "#ececec",
	muted: "#a8a8a8",
	accent: "#ececec",
	success: "#5fd38d",
	warning: "#ffa04d",
	error: "#ff453a",
	surface: "#121212",
	raised: "#222222",
	background: "#121212",
	selection: "#2a2a2a",
	secondary: "#6ea8ff",
	border: "#2e2e2e",
	signal: "#ff453a",
	faint: "#6f6f6f",
	code: "#1b2333",
	codeBlock: "#1a1a1a",
	tertiary: "#c58af9",
	bar: "#262626",
	barText: "#ffffff",
	barMuted: "#a8a8a8",
	chip: "#a8a8a8",
	jump: "#555555",
	agentMode: "#ffa04d",
};

export const lightTheme: Theme = {
	text: "#000000",
	muted: "#555555",
	accent: "#000000",
	success: "#007a3d",
	warning: "#b85400",
	error: "#e10600",
	surface: "#ffffff",
	raised: "#f2f2f2",
	background: "#ffffff",
	selection: "#ebebeb",
	secondary: "#0040c1",
	border: "#e3e3e3",
	signal: "#e10600",
	faint: "#9a9a9a",
	code: "#f1f3f8",
	codeBlock: "#f5f5f5",
	tertiary: "#7a1fa2",
	bar: "#000000",
	barText: "#ffffff",
	barMuted: "#bdbdbd",
	chip: "#4e4d4d",
	jump: "#555555",
	agentMode: "#b85400",
};

const builtIn: Readonly<Record<ThemeMode, Theme>> = {
	dark: darkTheme,
	light: lightTheme,
};

// why: the store keeps one object identity, so a Module reads `theme.accent` inside its JSX and follows a terminal that changes its background mid-session.
export function createTheme(
	renderer: CliRenderer,
	overrides: ThemeOverrides,
	preference: Accessor<ThemePreference>,
): Theme {
	const [terminalMode, follow] = createSignal(renderer.themeMode ?? "dark");
	const resolve = (): Theme => {
		const mode = preference();
		return {
			...builtIn[mode === "auto" ? terminalMode() : mode],
			...overrides,
		};
	};
	const [theme, setTheme] = createStore(resolve());
	createEffect(() => setTheme(reconcile(resolve())));
	// why: OpenTUI ignores the mode in a DEC 2031 notice and waits for an OSC 11 reply, which Orca omits after switching to dark.
	const notice = (sequence: string) => {
		if (sequence === "\x1b[?997;1n") follow("dark");
		if (sequence === "\x1b[?997;2n") follow("light");
		return false;
	};
	renderer.on("theme_mode", follow);
	renderer.prependInputHandler(notice);
	onCleanup(() => {
		renderer.off("theme_mode", follow);
		renderer.removeInputHandler(notice);
	});
	return theme;
}
