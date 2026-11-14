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
	"raised",
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
	text: "#e5e9f5",
	muted: "#a3aec6",
	accent: "#a9bfff",
	success: "#a3c9a8",
	warning: "#e4c18c",
	error: "#ee969f",
	surface: "#1c202b",
	raised: "#252b39",
	background: "#171a22",
	selection: "#29334c",
	secondary: "#a9bfff",
	border: "#46516b",
};

export const lightTheme: Theme = {
	text: "#242936",
	muted: "#666d7d",
	accent: "#3257b7",
	success: "#3f704b",
	warning: "#895d1c",
	error: "#af3d51",
	surface: "#fbfafc",
	raised: "#ffffff",
	background: "#eeedf0",
	selection: "#e8edf9",
	secondary: "#3257b7",
	border: "#c7cbd5",
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
