export type ThemeToken =
	| "text"
	| "muted"
	| "accent"
	| "success"
	| "warning"
	| "error"
	| "surface"
	| "border";

export type Theme = Readonly<Record<ThemeToken, string>>;

export const defaultTheme: Theme = {
	text: "#e6e6e6",
	muted: "#8a8a8a",
	accent: "#7aa2f7",
	success: "#9ece6a",
	warning: "#e0af68",
	error: "#f7768e",
	surface: "#1a1b26",
	border: "#3b4261",
};
