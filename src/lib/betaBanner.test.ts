import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { BetaBanner } from '../components/layout/BetaBanner'
import { BETA_FEEDBACK_URL, showsBetaBanner } from './betaBanner'

interface AnchorAttrs {
  html: string
  href?: string
  target?: string
  rel?: string
}

function renderLink(): AnchorAttrs {
  const html = renderToStaticMarkup(createElement(BetaBanner))
  const attr = (name: string) => html.match(new RegExp(`<a[^>]*\\s${name}="([^"]*)"`))?.[1]
  return { html, href: attr('href'), target: attr('target'), rel: attr('rel') }
}

describe('BetaBanner', () => {
  it('links the whole strip to the WhatsApp feedback group', () => {
    const { html, href } = renderLink()
    expect(href).toBe('https://chat.whatsapp.com/ExampleInvite')
    expect(href).toBe(BETA_FEEDBACK_URL)
    // One link wraps the whole message.
    expect(html.match(/<a\b/g)).toHaveLength(1)
    expect(html).toMatch(/^<a\b[\s\S]*<\/a>$/)
    expect(html.replace(/<[^>]+>/g, '')).toBe(
      'This is a beta test. Join the WhatsApp group to post feedback and ideas.',
    )
  })

  it('opens in a new tab without giving WhatsApp a handle on the app', () => {
    const { target, rel } = renderLink()
    expect(target).toBe('_blank')
    expect(rel?.split(' ')).toContain('noopener')
    expect(rel?.split(' ')).toContain('noreferrer')
  })
})

describe('showsBetaBanner', () => {
  it('shows on everyday screens', () => {
    for (const path of ['/', '/login', '/plan', '/history', '/progress', '/progress/best-efforts', '/program', '/program/edit', '/settings']) {
      expect(showsBetaBanner(path), path).toBe(true)
    }
  })

  it('hides where leaving mid-task loses something', () => {
    for (const path of ['/session/session-2026-10-05-upper', '/onboarding', '/check-in']) {
      expect(showsBetaBanner(path), path).toBe(false)
    }
  })
})
