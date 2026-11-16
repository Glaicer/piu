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
	"signal",
	"faint",
	"code",
	"codeBlock",
	"tertiary",
	"bar",
	"barText",
	"barMuted",
] as const;

export type ThemeToken = (typeof themeTokens)[number];

export function isThemeToken(name: string): name is ThemeToken {
	return (themeTokens as readonly string[]).includes(name);
}

export type Theme = Readonly<Record<ThemeToken, string>>;

export type ThemeOverrides = Readonly<Partial<Record<ThemeToken, string>>>;

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
