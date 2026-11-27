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
 * Visual tokens align with the Toolbox family foundation
 * (brand-assets/family-ui): family type stack, night neutrals as fallbacks,
 * control radius, 160ms motion, glass rail and the shared 2px focus ring.
 * Hosts override `--bg/--panel/--border-soft/--muted/--text/--panel-raised`
 * and the accent; the family tokens are optional.
 *
 * Invariant: the FULL player and the MINI player are mutually exclusive —
 * exactly one is visible at any time. Enforce this in app state, not CSS.
 */
export declare const WIDGET_HOST_CSS = "\n.app-body {\n  --wh-rail-width: 64px;\n  --wh-player-width: 340px;\n  --wh-bg: var(--bg, #101219);\n  --wh-bg-raised: var(--panel, #191c26);\n  --wh-border: var(--border-soft, #2a2f3e);\n  --wh-muted: var(--muted, #b0b6ca);\n  --wh-text: var(--text, #f2f3fa);\n  --wh-panel-raised: var(--panel-raised, #232735);\n\n  display: flex;\n  flex: 1 1 auto;\n  align-items: stretch;\n  min-height: 0;\n  font-family: var(--family-font, 'Segoe UI Variable Text', 'Segoe UI', system-ui, sans-serif);\n}\n\n.app-body > .content {\n  flex: 1 1 auto;\n  min-width: 0;\n}\n\n.screen-hidden {\n  display: none;\n}\n\n/* ---------- Vertical tool rail ---------- */\n\n.tool-rail {\n  display: flex;\n  flex: 0 0 var(--wh-rail-width);\n  flex-direction: column;\n  align-items: center;\n  gap: 8px;\n  width: var(--wh-rail-width);\n  padding: 10px 0;\n  border-left: 1px solid var(--wh-border);\n  background:\n    var(--family-glass-sheen, linear-gradient(155deg, #ffffff0d, transparent 56%)),\n    linear-gradient(180deg, var(--wh-bg-raised), var(--wh-bg));\n  box-shadow: var(--family-glass-edge, inset 0 1px 0 #ffffff14);\n  overflow: hidden;\n}\n\n.rail-brand {\n  display: grid;\n  flex: 0 0 auto;\n  place-items: center;\n  border-radius: var(--family-radius-control, 10px);\n}\n\n.rail-tools {\n  display: flex;\n  flex: 1 1 auto;\n  flex-direction: column;\n  align-items: center;\n  gap: 5px;\n  min-height: 0;\n  overflow-y: auto;\n  scrollbar-width: none;\n}\n\n.rail-tools::-webkit-scrollbar {\n  display: none;\n}\n\n.rail-tool {\n  display: grid;\n  flex: 0 0 auto;\n  place-items: center;\n  width: 38px;\n  height: 38px;\n  border: 1px solid transparent;\n  border-radius: var(--family-radius-control, 10px);\n  color: var(--accent, #5b8cff);\n  transition:\n    background var(--family-duration, 160ms) var(--family-ease, ease),\n    border-color var(--family-duration, 160ms) var(--family-ease, ease),\n    color var(--family-duration, 160ms) var(--family-ease, ease);\n}\n\n.rail-tool:focus-visible {\n  outline: 2px solid var(--family-focus, var(--accent, #5b8cff));\n  outline-offset: 3px;\n}\n\n.rail-tool:hover {\n  background: color-mix(in srgb, var(--accent, #5b8cff) 14%, transparent);\n  border-color: color-mix(in srgb, var(--accent, #5b8cff) 32%, transparent);\n}\n\n.rail-tool.active {\n  background: color-mix(in srgb, var(--accent, #5b8cff) 18%, transparent);\n  border-color: color-mix(in srgb, var(--accent, #5b8cff) 45%, transparent);\n}\n\n.rail-divider {\n  flex: 0 0 auto;\n  width: 22px;\n  height: 1px;\n  background: var(--wh-border);\n}\n\n.rail-actions {\n  display: flex;\n  flex: 0 0 auto;\n  flex-direction: column;\n  align-items: center;\n  gap: 5px;\n}\n\n.rail-actions .rail-tool {\n  color: var(--wh-muted);\n}\n\n.rail-actions .rail-tool:hover {\n  background: var(--wh-panel-raised);\n  border-color: var(--wh-border);\n  color: var(--wh-text);\n}\n\n/* ---------- Mode A: widget screen | rail | mini player ---------- */\n\n.mode-host > .content {\n  padding: 0;\n  overflow: hidden;\n}\n\n.host-screen {\n  height: 100%;\n  padding: 18px 16px 22px;\n  overflow-y: auto;\n  scrollbar-gutter: stable;\n}\n\n/* The glued widget renders as-is; only its outer width cap is lifted. */\n.host-screen .page {\n  max-width: none;\n  margin: 0;\n}\n\n.mode-host > .player-page {\n  flex: 0 0 var(--wh-player-width);\n  width: var(--wh-player-width);\n  border-left: 1px solid var(--wh-border);\n}\n\n/* ---------- Plain mini: rail | mini player ---------- */\n\n.mode-mini > .player-page {\n  flex: 1 1 auto;\n  min-width: 0;\n}\n\n/* ---------- Mode B: full player | rail (rail on the right) ---------- */\n\n.mode-full > .player-page {\n  order: -1;\n  flex: 1 1 auto;\n  min-width: 0;\n}\n\n/* ---------- Family accessibility defaults ---------- */\n\n@media (prefers-reduced-motion: reduce) {\n  .rail-tool {\n    transition: none;\n  }\n}\n\n@media (forced-colors: active) {\n  .rail-tool:focus-visible,\n  .rail-tool.active {\n    outline: 2px solid Highlight;\n  }\n  .rail-tool.active {\n    outline-offset: -3px;\n  }\n}\n";
