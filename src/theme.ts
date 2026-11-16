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
	signal: "#ff453a",
	faint: "#7c869c",
	code: "#263049",
	codeBlock: "#232836",
	tertiary: "#c58af9",
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
