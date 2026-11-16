const fs = require("node:fs");
// Ticket 42 mockup: Modals, Toasts and the / list in the Swiss light theme. Run: bun swiss-modals.js <out-dir>
const W = 116, H = 39;
const out = process.argv[2];
const hex = h => [1,3,5].map(i => parseInt(h.slice(i, i+2), 16));
const toHex = a => "#" + a.map(v => Math.round(v).toString(16).padStart(2, "0")).join("");
const grid = bg => Array.from({length: H}, () => Array.from({length: W}, () => ({ch: " ", fg: "#000000", bg, b: false, i: false, u: false})));
function fill(g, x, y, w, h, bg) { for (let r = y; r < y + h; r++) for (let c = x; c < x + w; c++) if (g[r]?.[c]) { g[r][c].bg = bg; g[r][c].ch = " "; g[r][c].u = false; } }
function text(g, x, y, s, fg, o = {}) { [...s].forEach((ch, k) => { const c = g[y]?.[x + k]; if (!c) return; c.ch = ch; c.fg = fg; if (o.bg) c.bg = o.bg; c.b = !!o.b; c.i = !!o.i; c.u = !!o.u; }); return x + [...s].length; }
const spans = (g, x, y, parts) => { for (const [s, fg, o] of parts) x = text(g, x, y, s, fg, o); return x; };
const width = parts => parts.reduce((n, [s]) => n + [...s].length, 0);
const right = (g, xEnd, y, parts) => spans(g, xEnd - width(parts), y, parts);
const rule = (g, x, y, w, ch, fg) => { for (let c = x; c < x + w; c++) text(g, c, y, ch, fg); };
// why: the Modal layer lays RGBA(0,0,0,100) over everything behind it (ticket 22).
const dim = g => { const k = 155 / 255; for (const row of g) for (const c of row) { c.fg = toHex(hex(c.fg).map(v => v * k)); c.bg = toHex(hex(c.bg).map(v => v * k)); } };

const p = {
  canvas: "#ffffff", raised: "#f2f2f2", text: "#000000", muted: "#555555", faint: "#9a9a9a", border: "#e3e3e3", signal: "#e10600", done: "#b5b5b5",
  chipBg: "#000000", chipFg: "#ffffff", inlineBg: "#f1f3f8", inlineCode: "#0040c1", warning: "#b85400",
  selBg: "#000000", selFg: "#ffffff", selMuted: "#bdbdbd",
  barBg: "#000000", barFg: "#bdbdbd", barFaint: "#7a7a7a", barStrong: "#ffffff", barSignal: "#ff4a3d",
};
const px = 2, pw = W - 4, cx = px + 3, cr = px + pw - 3, iy = H - 9;

function scene(typed) {
  const g = grid(p.canvas);
  const ic = s => [s, p.inlineCode, {bg: p.inlineBg}];
  fill(g, cx - 1, 2, cr - cx + 2, 3, p.raised);
  text(g, cx + 1, 3, "Why does the autocomplete test fail on CI but pass locally?", p.text, {b: true, bg: p.raised});
  right(g, cr - 1, 3, [["you", p.faint, {bg: p.raised}]]);
  spans(g, cx, 6, [["▸ ", p.faint], ["Thinking", p.muted, {i: true}], ["  4.2s", p.faint]]);
  const tool = (y, name, arg, st) => { spans(g, cx, y, [[" " + name + " ", p.chipFg, {bg: p.chipBg, b: true}], ["  " + arg, p.text]]); right(g, cr, y, [["● " + st, p.done]]); };
  tool(8, "read", "src/autocomplete.ts", "12ms");
  tool(9, "grep", "onMouseOver  builtin/", "31ms");
  tool(10, "bash", "bun test test/autocomplete.test.ts", "1.4s");
  spans(g, cx, 12, [["The test depends on ", p.text], ["hover state", p.text, {b: true}], [". On CI the pointer rests at (0,0), so", p.text]]);
  spans(g, cx, 13, [ic("recheckHoverState"), [" fires ", p.text], ic("over"), [" on the first row after every frame.", p.text]]);
  spans(g, cx, 15, [["Fix", p.text, {b: true}]]);
  spans(g, cx, 16, [["• ", p.signal], ["Select rows on ", p.text], ic("onMouseMove"), [", not ", p.text], ic("onMouseOver"), [".", p.text]]);
  spans(g, cx, 17, [["• ", p.signal], ["Add a test that opens the list under a ", p.text], ["resting", p.text, {b: true}], [" pointer.", p.text]]);
  rule(g, px, iy, pw, "━", p.text);
  if (typed) spans(g, cx - 1, iy + 2, [["› ", p.signal, {b: true}], [typed, p.text], [" ", p.text, {bg: p.signal}]]);
  else spans(g, cx - 1, iy + 2, [["› ", p.faint, {b: true}]]);
  spans(g, cx + 1, iy + 6, [["/ commands   @ files", p.faint]]);
  right(g, cr, iy + 6, [["⏎ send   ⇧⏎ new line", p.faint]]);
  fill(g, 0, H - 1, W, 1, p.barBg);
  spans(g, 1, H - 1, [["deepseek-v4.1-flash", p.barStrong, {b: true, bg: p.barBg}], [" · ", p.barFaint, {bg: p.barBg}], ["high", p.barFg, {bg: p.barBg}], ["    ~/.pi/openTUI", p.barFg, {bg: p.barBg}], [" · ", p.barFaint, {bg: p.barBg}], ["main", p.barFg, {bg: p.barBg}]]);
  return g;
}

// Modal frame: same padding as today (top 3, bottom 1, left 3, right 2). Row 0 is the heavy black line, row 1 the bold title.
function modal(g, x, y, w, h, title, hint) {
  fill(g, x, y, w, h, p.canvas);
  rule(g, x, y, w, "━", p.text);
  if (title) text(g, x + 3, y + 1, title, p.text, {b: true});
  if (hint) right(g, x + w - 2, y + 1, [[hint, p.faint]]);
  return {x: x + 3, y: y + 3, w: w - 5};
}
const row = (g, b, y, sel, parts, rightParts = []) => {
  if (sel) fill(g, b.x - 1, y, b.w + 1, 1, p.selBg);
  const recolor = ps => ps.map(([s, fg, o = {}]) => [s, sel ? (fg === p.text ? p.selFg : p.selMuted) : fg, {...o, bg: sel ? p.selBg : undefined}]);
  spans(g, b.x, y, recolor(parts));
  if (rightParts.length) right(g, b.x + b.w - 1, y, recolor(rightParts));
};
function toast(g, yTop, message, bg) {
  const w = [...message].length + 4, x = W - 2 - w;
  fill(g, x, yTop, w, 3, bg);
  text(g, x + 2, yTop + 1, message, p.chipFg, {bg});
  return yTop + 3;
}

const frames = [];

{ // 1: model picker + info Toast
  const g = scene(""); dim(g);
  const w = 60, h = 22, x = (W - w) >> 1, y = (H - h) >> 1;
  const b = modal(g, x, y, w, h, "Models", "esc");
  spans(g, b.x, b.y, [["Favorites", p.muted], ["   ", p.text], ["All", p.text, {b: true}]]);
  rule(g, b.x, b.y + 1, b.w, "─", p.border);
  rule(g, b.x + 12, b.y + 1, 3, "━", p.text);
  spans(g, b.x - 2, b.y + 2, [["› ", p.signal, {b: true}], [" ", p.text, {bg: p.signal}], [" search models", p.faint]]);
  const models = [
    ["★", "Claude Opus 5.5", "anthropic"], ["☆", "Claude Sonnet 5.5", "anthropic"], ["★", "DeepSeek V4.1 Flash", "deepseek", true],
    ["☆", "DeepSeek V4.1 Pro", "deepseek"], ["★", "GPT-6 mini", "openai"], ["☆", "Gemini 3.5 Pro", "google"],
    ["☆", "Kimi K3", "moonshot"], ["☆", "Qwen 4 Coder", "openrouter"], ["☆", "GLM 5", "zai"], ["☆", "Mistral Large 3", "mistral"],
    ["☆", "Grok 5", "xai"], ["☆", "Llama 5 70B", "groq"],
  ];
  models.forEach(([star, name, prov, current], k) => {
    const sel = k === 2;
    row(g, b, b.y + 4 + k, sel, [[star + " ", star === "★" ? p.text : p.faint], [name, p.text, {b: sel}], ...(current ? [["  current", p.faint]] : [])], [[prov, p.muted]]);
  });
  text(g, b.x + b.w, b.y + 4, "┃", p.text); for (let k = 5; k < 16; k++) text(g, b.x + b.w, b.y + k, "│", p.border);
  spans(g, b.x, b.y + 17, [["tab search/list   ←/→ tabs   f favorite   ⏎ pick", p.faint]]);
  toast(g, 1, "Model set to DeepSeek V4.1 Flash", p.chipBg);
  frames.push(["1 · Modal: выбор модели (вкладка All, строка выделена, звезда) + Toast info", g]);
}
{ // 2: Dialog select + error Toast
  const g = scene(""); dim(g);
  const opts = ["main", "release/1.4", "feat/swiss-design", "fix/hover-state", "spike/rpc-retry"];
  const w = 60, h = opts.length + 4, x = (W - w) >> 1, y = (H - h) >> 1;
  const b = modal(g, x, y, w, h, "Pick a branch to rebase onto", "esc");
  opts.forEach((o, k) => row(g, b, b.y + k, k === 0, [[o, p.text, {b: k === 0}]]));
  let t = toast(g, 1, "Model set to DeepSeek V4.1 Flash", p.chipBg);
  toast(g, t, "Couldn't reach the provider: 503 Service Unavailable", p.signal);
  frames.push(["2 · Dialog select + Toasts: info (чёрный) и error (красный) стопкой", g]);
}
{ // 3: Dialog confirm
  const g = scene(""); dim(g);
  const w = 60, h = 1 + 2 + 4, x = (W - w) >> 1, y = (H - h) >> 1;
  const b = modal(g, x, y, w, h, "Discard the draft?", "esc");
  text(g, b.x, b.y, "The text in the input will be lost.", p.muted);
  row(g, b, b.y + 1, true, [["Yes", p.text, {b: true}]]);
  row(g, b, b.y + 2, false, [["No", p.text]]);
  toast(g, 1, "Low disk space: 1.2 GB left", p.warning);
  frames.push(["3 · Dialog confirm + Toast warning (оранжевый)", g]);
}
{ // 4: / list over the composer, no dimming
  const g = scene("/");
  const entries = [["/model", "Switch the model"], ["/reasoning", "Set the reasoning level"], ["/new", "Start a new session"], ["/resume", "Resume a saved session"], ["/compact", "Compact the context"], ["/tree", "Browse the session tree"]];
  const fieldX = cx + 1, fieldW = cr - fieldX, fieldY = iy + 2;
  const lx = fieldX - 4, lw = fieldW + 6, ly = fieldY - entries.length - 4, lh = entries.length + 2;
  fill(g, lx, ly, lw, lh, p.raised);
  rule(g, lx, ly, lw, "━", p.text);
  const b = {x: lx + 2, w: lw - 3};
  entries.forEach(([l, d], k) => row(g, b, ly + 1 + k, k === 0, [[l.padEnd(12), p.text, {b: true}], [d, p.muted]]));
  frames.push(["4 · Список / над полем ввода (так же @): без затемнения, подложка raised, сверху ━", g]);
}

function ansi(frames) {
  let s = "";
  for (const [title, g] of frames) {
    s += "\x1b[0m── " + title + " ──\n";
    for (const r of g) { for (const c of r) { const [a, b, d] = hex(c.fg), [e, f, h] = hex(c.bg); s += "\x1b[0;" + (c.b ? "1;" : "") + (c.i ? "3;" : "") + (c.u ? "4;" : "") + "38;2;" + a + ";" + b + ";" + d + ";48;2;" + e + ";" + f + ";" + h + "m" + c.ch; } s += "\x1b[0m\n"; }
    s += "\n";
  }
  return s;
}
function svg(frames) {
  const cw = 10, chh = 22, gap = 2, esc = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const fh = (H + gap) * chh;
  let o = '<svg xmlns="http://www.w3.org/2000/svg" width="' + W * cw + '" height="' + frames.length * fh + '" font-family="Adwaita Mono" font-size="16.5"><rect width="100%" height="100%" fill="#2b2b2b"/>';
  frames.forEach(([title, g], n) => {
    const top = n * fh + gap * chh;
    o += '<text x="4" y="' + (top - 8) + '" fill="#dddddd">' + esc(title) + '</text>';
    g.forEach((r, y) => {
      r.forEach((c, x) => { o += '<rect x="' + x * cw + '" y="' + (top + y * chh) + '" width="' + (cw + 0.6) + '" height="' + (chh + 0.6) + '" fill="' + c.bg + '"/>'; });
      r.forEach((c, x) => { if (c.ch !== " ") o += '<text x="' + x * cw + '" y="' + (top + y * chh + 16) + '" fill="' + c.fg + '"' + (c.b ? ' font-weight="bold"' : '') + (c.i ? ' font-style="italic"' : '') + ' textLength="' + cw + '">' + esc(c.ch) + '</text>'; });
    });
  });
  return o + '</svg>';
}
fs.writeFileSync(out + "/swiss-modals-light.ans", ansi(frames));
fs.writeFileSync(out + "/swiss-modals-light.svg", svg(frames));
