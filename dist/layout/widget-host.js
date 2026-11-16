/**
 * Widget host — portable "glued building blocks" layout pattern.
 *
 * Reference implementation: toolbox-desktop (src/renderer/src/styles.css,
 * "Widget host" section). This module ships the framework-agnostic CSS as a
 * string so every toolbox app (desktop, NAS, MCP, …) can inject the same
 * pattern without a build step that copies .css files. It carries its own
 * token fallbacks so it renders correctly even without the host app's theme.
 *
 * Structure: ONE flex body with three stable children, in this DOM order:
 *     <div class="app-body mode-…">
 *       <main class="content">…widget screen…</main>   (the glued widget)
 *       <nav class="tool-rail">…vertical toolbar…</nav>
 *       <section class="player-page">…player…</section>
 *     </div>
 * Keeping the player mounted in a fixed position means switching modes never
 * remounts it (audio/state survive). Modes only change CSS order/visibility.
 *
 * Modes:
 *   mode-host   [ widget screen | rail | mini player ]   (glued widgets)
 *   mode-mini   [ rail | mini player ]                   (compact player)
 *   mode-full   [ full player | rail ]                   (rail on the RIGHT)
 *   mode-normal [ widget screen ]                        (rail/player hidden)
 *
 * Apps without a player (NAS, MCP) still adopt the glued stage + right rail:
 * use `.app-body.mode-host` with `.content > .host-screen` and `.tool-rail`,
 * or apply `.host-screen` to an existing grid/flex stage.
 *
 * Invariant: the FULL player and the MINI player are mutually exclusive —
 * exactly one is visible at any time. Enforce this in app state, not CSS.
 */
export const WIDGET_HOST_CSS = `
.app-body {
  --wh-rail-width: 64px;
  --wh-player-width: 340px;
  --wh-bg: #121923;
  --wh-bg-raised: #1c2431;
  --wh-border: var(--border-soft, rgba(255, 255, 255, 0.08));
  --wh-muted: var(--muted, #93a9c8);
  --wh-text: var(--text, #e8eef7);
  --wh-panel-raised: var(--panel-raised, #232c3b);

  display: flex;
  flex: 1 1 auto;
  align-items: stretch;
  min-height: 0;
}

.app-body > .content {
  flex: 1 1 auto;
  min-width: 0;
}

.screen-hidden {
  display: none;
}

/* ---------- Vertical tool rail ---------- */

.tool-rail {
  display: flex;
  flex: 0 0 var(--wh-rail-width);
  flex-direction: column;
  align-items: center;
  gap: 8px;
  width: var(--wh-rail-width);
  padding: 10px 0;
  border-left: 1px solid var(--wh-border);
  background: linear-gradient(180deg, var(--wh-bg-raised), var(--wh-bg));
  overflow: hidden;
}

.rail-brand {
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 9px;
}

.rail-tools {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  min-height: 0;
  overflow-y: auto;
  scrollbar-width: none;
}

.rail-tools::-webkit-scrollbar {
  display: none;
}

.rail-tool {
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  width: 38px;
  height: 38px;
  border: 1px solid transparent;
  border-radius: 10px;
  color: var(--accent, #5b8cff);
  transition: background 0.14s ease, border-color 0.14s ease, color 0.14s ease;
}

.rail-tool:hover {
  background: color-mix(in srgb, var(--accent, #5b8cff) 14%, transparent);
  border-color: color-mix(in srgb, var(--accent, #5b8cff) 32%, transparent);
}

.rail-tool.active {
  background: color-mix(in srgb, var(--accent, #5b8cff) 18%, transparent);
  border-color: color-mix(in srgb, var(--accent, #5b8cff) 45%, transparent);
}

.rail-divider {
  flex: 0 0 auto;
  width: 22px;
  height: 1px;
  background: var(--wh-border);
}

.rail-actions {
  display: flex;
  flex: 0 0 auto;
  flex-direction: column;
  align-items: center;
  gap: 5px;
}

.rail-actions .rail-tool {
  color: var(--wh-muted);
}

.rail-actions .rail-tool:hover {
  background: var(--wh-panel-raised);
  border-color: var(--wh-border);
  color: var(--wh-text);
}

/* ---------- Mode A: widget screen | rail | mini player ---------- */

.mode-host > .content {
  padding: 0;
  overflow: hidden;
}

.host-screen {
  height: 100%;
  padding: 18px 16px 22px;
  overflow-y: auto;
  scrollbar-gutter: stable;
}

/* The glued widget renders as-is; only its outer width cap is lifted. */
.host-screen .page {
  max-width: none;
  margin: 0;
}

.mode-host > .player-page {
  flex: 0 0 var(--wh-player-width);
  width: var(--wh-player-width);
  border-left: 1px solid var(--wh-border);
}

/* ---------- Plain mini: rail | mini player ---------- */

.mode-mini > .player-page {
  flex: 1 1 auto;
  min-width: 0;
}

/* ---------- Mode B: full player | rail (rail on the right) ---------- */

.mode-full > .player-page {
  order: -1;
  flex: 1 1 auto;
  min-width: 0;
}
`;
//# sourceMappingURL=widget-host.js.map