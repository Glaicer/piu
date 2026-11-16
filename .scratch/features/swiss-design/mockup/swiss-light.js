
const fs = require("node:fs");
const W = 116, H = 39;
const out = process.argv[2];
const hex = h => [1,3,5].map(i => parseInt(h.slice(i, i+2), 16));
const grid = bg => Array.from({length: H}, () => Array.from({length: W}, () => ({ch: " ", fg: "#000000", bg, b: false, i: false})));
function fill(g, x, y, w, h, bg) { for (let r = y; r < y + h; r++) for (let c = x; c < x + w; c++) if (g[r]?.[c]) { g[r][c].bg = bg; g[r][c].ch = " "; } }
function text(g, x, y, s, fg, o = {}) { [...s].forEach((ch, k) => { const c = g[y]?.[x + k]; if (!c) return; c.ch = ch; c.fg = fg; if (o.bg) c.bg = o.bg; c.b = !!o.b; c.i = !!o.i; }); return x + [...s].length; }
const spans = (g, x, y, parts) => { for (const [s, fg, o] of parts) x = text(g, x, y, s, fg, o); return x; };
const width = parts => parts.reduce((n, [s]) => n + [...s].length, 0);
const right = (g, xEnd, y, parts) => spans(g, xEnd - width(parts), y, parts);
function card(g, x, y, w, h, color, style, behind) {
  if (style === "halfblock") {
    for (let c = x; c < x + w; c++) { text(g, c, y, "▄", color, {bg: behind}); text(g, c, y + h - 1, "▀", color, {bg: behind}); }
    fill(g, x, y + 1, w, h - 2, color);
  } else fill(g, x, y, w, h, color);
}
const rule = (g, x, y, w, ch, fg) => { for (let c = x; c < x + w; c++) text(g, c, y, ch, fg); };
function svg(g) {
  const cw = 10, chh = 22, esc = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  let o = '<svg xmlns="http://www.w3.org/2000/svg" width="' + W * cw + '" height="' + H * chh + '" font-family="Adwaita Mono" font-size="16.5">';
  g.forEach((row, y) => {
    row.forEach((c, x) => { o += '<rect x="' + x * cw + '" y="' + y * chh + '" width="' + (cw + 0.6) + '" height="' + (chh + 0.6) + '" fill="' + c.bg + '"/>'; });
    row.forEach((c, x) => { if (c.ch !== " ") o += '<text x="' + x * cw + '" y="' + (y * chh + 16) + '" fill="' + c.fg + '"' + (c.b ? ' font-weight="bold"' : '') + (c.i ? ' font-style="italic"' : '') + ' textLength="' + cw + '">' + esc(c.ch) + '</text>'; });
  });
  return o + '</svg>';
}
function ansi(g, title) {
  let s = "\x1b[0m── " + title + " ──\n";
  for (const row of g) {
    for (const c of row) { const [a, b, d] = hex(c.fg), [e, f, h] = hex(c.bg); s += "\x1b[0;" + (c.b ? "1;" : "") + (c.i ? "3;" : "") + "38;2;" + a + ";" + b + ";" + d + ";48;2;" + e + ";" + f + ";" + h + "m" + c.ch; }
    s += "\x1b[0m\n";
  }
  return s;
}

const p = {
  canvas: "#ffffff", raised: "#f2f2f2", text: "#000000", muted: "#555555", faint: "#9a9a9a", signal: "#e10600", done: "#b5b5b5",
  chipBg: "#000000", chipFg: "#ffffff",
  inlineBg: "#f1f3f8", inlineCode: "#0040c1",
  codeBg: "#f5f5f5",
  code: {comment: ["#9a9a9a", {i: true}], keyword: ["#000000", {b: true}], punct: ["#6b6b6b"], text: ["#000000"], tag: ["#0040c1"], attr: ["#7a1fa2"], func: ["#0040c1"], string: ["#007a3d"], number: ["#b85400"], type: ["#7a1fa2"]},
  barBg: "#000000", barFg: "#bdbdbd", barFaint: "#7a7a7a", barStrong: "#ffffff", barSignal: "#ff4a3d",
};
const code = [
  [["// builtin/input/index.tsx", "comment"]],
  [["<", "punct"], ["box", "tag"], [" onMouseOver", "attr"], ["={() ", "punct"], ["=>", "keyword"], [" setSelected", "func"], ["(", "punct"], ["row", "text"], [")}>", "punct"], ["   // before", "comment"]],
  [["<", "punct"], ["box", "tag"], [" onMouseMove", "attr"], ["={() ", "punct"], ["=>", "keyword"], [" setSelected", "func"], ["(", "punct"], ["row", "text"], [")}>", "punct"], ["   // after", "comment"]],
  [["const", "keyword"], [" delay", "text"], [": ", "punct"], ["number", "type"], [" = ", "punct"], ["16", "number"], [";", "punct"], ["  // one frame", "comment"]],
  [["await", "keyword"], [" waitFor", "func"], ["(", "punct"], ['"resting pointer"', "string"], [", { ", "punct"], ["delay", "text"], [" });", "punct"]],
];
const g = grid(p.canvas);
const px = 2, pw = W - 4, cx = px + 3, cr = px + pw - 3;
const ic = s => [s, p.inlineCode, {bg: p.inlineBg}];
fill(g, cx - 1, 2, cr - cx + 2, 3, p.raised);
text(g, cx + 1, 3, "Why does the autocomplete test fail on CI but pass locally?", p.text, {b: true});
right(g, cr - 1, 3, [["you", p.faint]]);
spans(g, cx, 6, [["▸ ", p.faint], ["Thinking", p.muted, {i: true}], ["  4.2s", p.faint]]);
const tool = (y, name, arg, st, col, dot) => {
  spans(g, cx, y, [[" " + name + " ", p.chipFg, {bg: p.chipBg, b: true}], ["  " + arg, p.text]]);
  right(g, cr, y, [[dot + " ", col], [st, col]]);
};
tool(8, "read", "src/autocomplete.ts", "12ms", p.done, "●");
tool(9, "grep", "onMouseOver  builtin/", "31ms", p.done, "●");
tool(10, "bash", "bun test test/autocomplete.test.ts", "running 3.1s", p.signal, "◐");
spans(g, cx, 12, [["The test depends on ", p.text], ["hover state", p.text, {b: true}], [". On CI the pointer rests at (0,0), so", p.text]]);
spans(g, cx, 13, [ic("recheckHoverState"), [" fires ", p.text], ic("over"), [" on the first row after every frame:", p.text]]);
fill(g, cx, 15, cr - cx, 7, p.codeBg);
right(g, cr - 1, 15, [["tsx", p.faint]]);
code.forEach((line, k) => spans(g, cx + 2, 16 + k, line.map(([s, r]) => [s, p.code[r][0], p.code[r][1] ?? {}])));
spans(g, cx, 23, [["Fix", p.text, {b: true}]]);
spans(g, cx, 24, [["• ", p.signal], ["Select rows on ", p.text], ic("onMouseMove"), [", not ", p.text], ic("onMouseOver"), [".", p.text]]);
spans(g, cx, 25, [["• ", p.signal], ["Add a test that opens the list under a ", p.text], ["resting", p.text, {b: true}], [" pointer", p.text], ["▍", p.signal]]);
// composer: rule, one row of padding, 4 input lines, hints
const iy = H - 9;
rule(g, px, iy, pw, "━", p.text);
spans(g, cx - 1, iy + 2, [["› ", p.signal, {b: true}], ["ok, apply the fix and run the suite,", p.text]]);
spans(g, cx + 1, iy + 3, [["then commit it with a short message", p.text], [" ", p.text, {bg: p.signal}]]);
spans(g, cx + 1, iy + 6, [["/ commands   @ files   esc interrupt", p.faint]]);
right(g, cr, iy + 6, [["⏎ send   ⇧⏎ new line", p.faint]]);
// status: model, reasoning, folder — no brand, no context
fill(g, 0, H - 1, W, 1, p.barBg);
spans(g, 1, H - 1, [["deepseek-v4.1-flash", p.barStrong, {b: true}], [" · ", p.barFaint], ["high", p.barFg], ["    ~/.pi/openTUI", p.barFg], [" · ", p.barFaint], ["main", p.barFg]]);
right(g, W - 1, H - 1, [["◐ working", p.barSignal, {b: true}]]);
fs.writeFileSync(out + "/6-swiss-red-v2.ans", ansi(g, "Ink 6 · Swiss v2: подсветка синтаксиса, цветной inline-код, ввод на 4 строки, статус без piu и контекста"));
fs.writeFileSync(out + "/6-swiss-red-v2.svg", svg(g));
