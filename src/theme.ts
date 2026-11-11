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
	"border",
] as const;

export type ThemeToken = (typeof themeTokens)[number];

export function isThemeToken(name: string): name is ThemeToken {
	return (themeTokens as readonly string[]).includes(name);
}

export type Theme = Readonly<Record<ThemeToken, string>>;

export type ThemeOverrides = Readonly<Partial<Record<ThemeToken, string>>>;

export const darkTheme: Theme = {
	text: "#e6e6e6",
	muted: "#8a8a8a",
	accent: "#7aa2f7",
	success: "#9ece6a",
	warning: "#e0af68",
	error: "#f7768e",
	surface: "#1a1b26",
	border: "#3b4261",
};

export const lightTheme: Theme = {
	text: "#343b58",
	muted: "#565f89",
	accent: "#34548a",
	success: "#385f0d",
	warning: "#8f5e15",
	error: "#8c4351",
	surface: "#e1e2e7",
	border: "#a8aecb",
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
