import type { CliRenderer, ThemeMode } from "@opentui/core";
import { onCleanup } from "solid-js";
import { createStore, reconcile } from "solid-js/store";

export const themeTokens = [
	"text",
	"muted",
	"accent",
	"success",
	"warning",
	"error",
	"surface",
	"background",
	"selection",
	"secondary",
	"border",
] as const;

export type ThemeToken = (typeof themeTokens)[number];

export function isThemeToken(name: string): name is ThemeToken {
	return (themeTokens as readonly string[]).includes(name);
}

export type Theme = Readonly<Record<ThemeToken, string>>;

export type ThemeOverrides = Readonly<Partial<Record<ThemeToken, string>>>;

export const darkTheme: Theme = {
	text: "#eee9e7",
	muted: "#a09aa8",
	accent: "#f2b8a0",
	success: "#a3c9a8",
	warning: "#e4c18c",
	error: "#ee969f",
	surface: "#1b1a21",
	background: "#111115",
	selection: "#35303f",
	secondary: "#b8a5df",
	border: "#35333e",
};

export const lightTheme: Theme = {
	text: "#302c35",
	muted: "#6f6577",
	accent: "#9d4b32",
	success: "#3f704b",
	warning: "#895d1c",
	error: "#af3d51",
	surface: "#eee9e7",
	background: "#faf7f5",
	selection: "#e0d6e8",
	secondary: "#75539e",
	border: "#d0c6d2",
};

const builtIn: Readonly<Record<ThemeMode, Theme>> = {
	dark: darkTheme,
	light: lightTheme,
};

// why: the store keeps one object identity, so a Module reads `theme.accent` inside its JSX and follows a terminal that changes its background mid-session.
export function createTheme(
	renderer: CliRenderer,
	overrides: ThemeOverrides,
): Theme {
	const resolve = (mode: ThemeMode): Theme => ({
		...builtIn[mode],
		...overrides,
	});
	const [theme, setTheme] = createStore(resolve(renderer.themeMode ?? "dark"));
	const follow = (mode: ThemeMode) => setTheme(reconcile(resolve(mode)));
	renderer.on("theme_mode", follow);
	onCleanup(() => renderer.off("theme_mode", follow));
	return theme;
}
