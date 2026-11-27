import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { WIDGET_HOST_CSS } from '../dist/index.js'

describe('WIDGET_HOST_CSS portable pattern', () => {
  it('is a non-empty stylesheet string', () => {
    assert.equal(typeof WIDGET_HOST_CSS, 'string')
    assert.ok(WIDGET_HOST_CSS.trim().length > 0)
  })

  it('defines the glued body, vertical rail and host stage', () => {
    for (const selector of ['.app-body', '.tool-rail', '.rail-tool', '.host-screen', '.screen-hidden']) {
      assert.ok(WIDGET_HOST_CSS.includes(selector), `missing ${selector}`)
    }
    assert.match(WIDGET_HOST_CSS, /\.tool-rail\s*{[^}]*flex-direction:\s*column/)
  })

  it('keeps the layout modes and the right-rail full-player rule', () => {
    for (const mode of ['.mode-host', '.mode-mini', '.mode-full']) {
      assert.ok(WIDGET_HOST_CSS.includes(mode), `missing ${mode}`)
    }
    // Mode B puts the rail on the RIGHT by moving the player first.
    assert.match(WIDGET_HOST_CSS, /\.mode-full\s*>\s*\.player-page\s*{[^}]*order:\s*-1/)
  })

  it('carries theme token fallbacks so it renders without the host theme', () => {
    assert.ok(WIDGET_HOST_CSS.includes('--wh-rail-width'))
    assert.ok(WIDGET_HOST_CSS.includes('--wh-player-width'))
    assert.ok(WIDGET_HOST_CSS.includes('var(--border-soft,'))
  })

  it('aligns with the family foundation (type, neutrals, radii, motion, focus)', () => {
    assert.match(WIDGET_HOST_CSS, /font-family:\s*var\(--family-font/)
    assert.match(WIDGET_HOST_CSS, /--wh-bg:\s*var\(--bg,\s*#101219\)/)
    assert.match(WIDGET_HOST_CSS, /--wh-text:\s*var\(--text,\s*#f2f3fa\)/)
    assert.ok(WIDGET_HOST_CSS.includes('var(--family-radius-control'))
    assert.ok(WIDGET_HOST_CSS.includes('var(--family-duration'))
    assert.ok(WIDGET_HOST_CSS.includes('var(--family-glass-sheen'))
    assert.match(WIDGET_HOST_CSS, /\.rail-tool:focus-visible\s*{[^}]*outline:\s*2px solid/)
    assert.match(WIDGET_HOST_CSS, /@media \(prefers-reduced-motion: reduce\)/)
  })
})