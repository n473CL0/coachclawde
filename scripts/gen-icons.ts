// Generates the home-screen / PWA app icons (and the favicon) from the shared
// Clawde-crab pixel grid, so the installed icon always matches the in-app mark.
//
// Run with:  node --experimental-strip-types scripts/gen-icons.ts
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Resvg } from '@resvg/resvg-js'
import { crabCells, CRAB_COLS, CRAB_ROWS } from '../src/lib/crabArt.ts'

const here = dirname(fileURLToPath(import.meta.url))
const publicDir = resolve(here, '../public')
const iconsDir = resolve(publicDir, 'icons')
mkdirSync(iconsDir, { recursive: true })

interface SvgOpts {
  /** Canvas size in px */
  size: number
  /** Fraction of the canvas kept as empty padding around the crab (safe zone) */
  pad: number
  /** Corner radius in px (browser favicon only — OS masks the PNG icons) */
  radius?: number
  /** Draw the dripping sweat bead */
  sweat?: boolean
}

function buildSvg({ size, pad, radius = 0, sweat = true }: SvgOpts): string {
  const inner = size * (1 - 2 * pad)
  const scale = Math.min(inner / CRAB_COLS, inner / CRAB_ROWS)
  const offX = (size - CRAB_COLS * scale) / 2
  const offY = (size - CRAB_ROWS * scale) / 2
  const bleed = scale * 0.04

  const px = (col: number) => offX + col * scale
  const py = (row: number) => offY + row * scale

  const cells = crabCells()
    .map(
      (c) =>
        `<rect x="${(px(c.x) - bleed).toFixed(2)}" y="${(py(c.y) - bleed).toFixed(2)}" ` +
        `width="${(scale + bleed * 2).toFixed(2)}" height="${(scale + bleed * 2).toFixed(2)}" fill="${c.fill}"/>`,
    )
    .join('')

  // Sweat bead off the band's right tip (band stripe sits on grid row 5).
  const beadX = px(12)
  const beadY = py(6.2)
  const bead = sweat
    ? `<rect x="${beadX.toFixed(2)}" y="${beadY.toFixed(2)}" width="${scale.toFixed(2)}" height="${(scale * 1.1).toFixed(2)}" fill="#7cc5ff"/>` +
      `<rect x="${(beadX + scale * 0.2).toFixed(2)}" y="${(beadY + scale * 0.2).toFixed(2)}" width="${(scale * 0.32).toFixed(2)}" height="${(scale * 0.32).toFixed(2)}" fill="#bfe2ff"/>`
    : ''

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#241712"/>
      <stop offset="1" stop-color="#100f0e"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="42%" r="62%">
      <stop offset="0" stop-color="#d97756" stop-opacity="0.38"/>
      <stop offset="1" stop-color="#d97756" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${radius}" fill="url(#bg)"/>
  <rect width="${size}" height="${size}" rx="${radius}" fill="url(#glow)"/>
  ${cells}${bead}
</svg>`
}

function png(svg: string, width: number): Buffer {
  return new Resvg(svg, { fitTo: { mode: 'width', value: width } }).render().asPng()
}

// Standard PWA icons (the OS applies its own rounded mask, so square + minimal pad).
const any192 = buildSvg({ size: 192, pad: 0.14 })
const any512 = buildSvg({ size: 512, pad: 0.14 })
// Maskable needs a generous safe zone so nothing is clipped by the OS mask.
const maskable = buildSvg({ size: 512, pad: 0.24 })
// Apple touch icon — iOS rounds the corners itself.
const apple = buildSvg({ size: 180, pad: 0.12 })
// Favicon: small rounded tile for the browser tab.
const favicon = buildSvg({ size: 64, pad: 0.08, radius: 14 })

writeFileSync(resolve(iconsDir, 'icon-192.png'), png(any192, 192))
writeFileSync(resolve(iconsDir, 'icon-512.png'), png(any512, 512))
writeFileSync(resolve(iconsDir, 'maskable-512.png'), png(maskable, 512))
writeFileSync(resolve(iconsDir, 'apple-touch-icon.png'), png(apple, 180))
writeFileSync(resolve(publicDir, 'favicon.svg'), favicon)

console.log('Generated app icons in public/icons + public/favicon.svg')
