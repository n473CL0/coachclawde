import { useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { Button } from './Button'
import { openClaudeApp, openClaudeWeb } from '../../lib/openClaude'

/**
 * "Open Claude" button: copies the prompt, then hands off to the installed
 * Claude app (already signed in) rather than a browser tab. If the app doesn't
 * open, reveals a link to claude.ai in the browser instead. The browser link is
 * always a direct tap so it isn't popup-blocked.
 */
export function OpenClaudeButton({ text, onCopied }: { text: string; onCopied?: () => void }) {
  const [appMissing, setAppMissing] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      onCopied?.()
    } catch {
      // Clipboard may be unavailable — the prompt is still visible to copy by hand.
    }
  }

  async function handleOpenApp() {
    setAppMissing(false)
    await copy()
    const opened = await openClaudeApp()
    if (!opened) setAppMissing(true)
  }

  async function handleOpenWeb() {
    // Start the copy before the new tab steals focus, but open the tab
    // synchronously within the tap so it isn't popup-blocked.
    const copying = copy()
    openClaudeWeb()
    await copying
  }

  return (
    <div className="flex flex-col gap-2">
      <Button onClick={handleOpenApp} fullWidth size="lg">
        <ExternalLink size={18} />
        Open Claude app
      </Button>
      {appMissing ? (
        <p className="text-xs text-center text-[#a8a29e]">
          Claude app didn't open?{' '}
          <button onClick={handleOpenWeb} className="text-[#d97756] font-medium underline underline-offset-2">
            Use claude.ai in your browser
          </button>
        </p>
      ) : (
        <button onClick={handleOpenWeb} className="text-xs text-[#6a6a6a] hover:text-[#a8a29e]">
          or open claude.ai in your browser
        </button>
      )}
    </div>
  )
}
