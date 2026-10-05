import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { BetaFeedbackTile } from '../components/shared/BetaFeedbackTile'
import { BETA_FEEDBACK_URL } from './betaFeedback'

function render() {
  const html = renderToStaticMarkup(createElement(BetaFeedbackTile))
  const attr = (name: string) => html.match(new RegExp(`<a[^>]*\\s${name}="([^"]*)"`))?.[1]
  return { html, href: attr('href'), target: attr('target'), rel: attr('rel') }
}

describe('BetaFeedbackTile', () => {
  it('links the whole tile to the WhatsApp feedback group', () => {
    const { html, href } = render()
    expect(href).toBe('https://chat.whatsapp.com/ExampleInvite')
    expect(href).toBe(BETA_FEEDBACK_URL)
    // One link wraps the whole tile.
    expect(html.match(/<a\b/g)).toHaveLength(1)
    expect(html).toMatch(/^<a\b[\s\S]*<\/a>$/)
    expect(html).toContain('Join the WhatsApp group')
  })

  it('opens in a new tab without giving WhatsApp a handle on the app', () => {
    const { target, rel } = render()
    expect(target).toBe('_blank')
    expect(rel?.split(' ')).toContain('noopener')
    expect(rel?.split(' ')).toContain('noreferrer')
  })
})
