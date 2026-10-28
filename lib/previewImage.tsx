import { readFileSync } from 'node:fs'
import path from 'node:path'
import { ImageResponse } from 'next/og'
import { SITE_NAME } from './metadata'

// The generated link-preview card, 1200x630, shared by /preview-image and
// /recipes/[slug]/preview-image. Satori reads neither WebP nor WOFF2, so the
// logo is a PNG copy of public/images/llama-icon.webp and the font is static
// Fraunces SemiBold WOFF in two subsets (OFL licensed, alongside).

const ASSETS = path.join(process.cwd(), 'assets', 'preview-image')
// Satori draws a family with one font, so Latin Extended gets its own name; it
// falls back to that font, by glyph, for letters the Latin subset lacks.
const fonts = [
  { name: 'Fraunces', subset: 'latin' },
  { name: 'Fraunces Latin Ext', subset: 'latin-ext' },
].map(({ name, subset }) => ({
  name,
  data: readFileSync(path.join(ASSETS, `fraunces-${subset}-600-normal.woff`)),
  weight: 600 as const,
  style: 'normal' as const,
}))
const logo = `data:image/png;base64,${readFileSync(path.join(ASSETS, 'llama-icon.png')).toString('base64')}`

// The light palette's tokens from styles/globals.css.
const BG = '#f7f5fa'
const TEXT = '#2a2433'
const PRIMARY = '#65558f'

// The code points the two fonts have glyphs for, read from their cmap tables.
// Narrower than the subsets' unicode-range in @fontsource/fraunces@5.3.0, which
// lists code points the subsets are served for, not ones they draw. For any
// other character next/og would fetch a fallback font at render. Regenerate
// this table if either font file changes; nothing checks it against them.
const FONT_RANGES = (
  'U+0020-007E,U+00A0-0148,U+014A-017E,U+018F,U+0192,U+01A0-01A1,U+01AF-01B0,U+01C4-01CC,U+01D9-01DA,' +
  'U+01E6-01E7,U+01EA-01EB,U+01FA-021B,U+022A-022D,U+0230-0233,U+0237,U+0259,U+02B9-02BA,U+02BC,' +
  'U+02C6-02C7,U+02DA,U+02DC-02DD,U+0300-0301,U+0303-0304,U+0308,U+1E08-1E09,U+1E0C-1E0F,U+1E14-1E17,' +
  'U+1E1C-1E1D,U+1E20-1E21,U+1E24-1E25,U+1E2A-1E2B,U+1E2E-1E2F,U+1E36-1E37,U+1E3A-1E3B,U+1E42-1E43,' +
  'U+1E46-1E49,U+1E4C-1E53,U+1E5A-1E5B,U+1E5E-1E5F,U+1E62-1E65,U+1E6C-1E6F,U+1E78-1E7B,U+1E80-1E85,' +
  'U+1E92-1E93,U+1E97,U+1E9E,U+1EF2-1EF9,U+2013-2014,U+2018-201A,U+201C-201E,U+2020,U+2022,U+2026,' +
  'U+2032-2033,U+2039-203A,U+2044,U+20A1,U+20A3-20A4,U+20A6-20A7,U+20A9,U+20AB-20AD,U+20B1-20B2,' +
  'U+20B5,U+20B9-20BA,U+20BC-20BD,U+2122,U+2212,U+2215'
)
  .split(',')
  .map((range) => {
    const [start, end = start] = range.slice(2).split('-')
    return [parseInt(start, 16), parseInt(end, 16)]
  })

// Emoji and their parts: pictographs, skin tones, keycaps, ZWJ, variation selectors and tags.
const EMOJI = /[#*0-9]\uFE0F?\u20E3|\p{Extended_Pictographic}|\p{Emoji_Modifier}|[\u200D\uFE00-\uFE0F\u{E0020}-\u{E007F}]/gu
const CONTROL = /[\p{Cc}\p{Cf}]/gu

const inFont = (char: string) => {
  const code = char.codePointAt(0)!
  return FONT_RANGES.some(([start, end]) => code >= start && code <= end)
}

// The card's title: the name without emoji, control and format characters, or
// anything else the shipped fonts can't draw, so rendering never fetches.
// Whitespace becomes single spaces first, so a tab or newline still separates words.
export function previewCardTitle(name: string): string {
  const stripped = name.normalize('NFC').replace(/\s+/gu, ' ').replace(EMOJI, '').replace(CONTROL, '')
  return Array.from(stripped).filter(inFont).join('').replace(/\s+/gu, ' ').trim()
}

// Smaller for longer names, so the longest still fits in three lines.
export function previewTitleSize(name: string): number {
  if (name.length <= 30) return 72
  if (name.length <= 60) return 60
  return 48
}

// A title that sanitises to nothing leaves the logo and wordmark alone.
export function previewCard(name: string, cacheControl: string): ImageResponse {
  const title = previewCardTitle(name)
  return new ImageResponse(
    (
      <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', background: BG }}>
        <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, padding: '64px 80px' }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- Satori renders plain img only. */}
            <img src={logo} width={96} height={96} alt="" />
            <div style={{ marginLeft: 24, fontFamily: 'Fraunces', fontSize: 36, color: PRIMARY }}>{SITE_NAME}</div>
          </div>
          <div style={{ display: 'flex', flexGrow: 1, alignItems: 'center' }}>
            {title && (
              <div
                style={{
                  display: 'block',
                  lineClamp: 3,
                  fontFamily: 'Fraunces',
                  fontSize: previewTitleSize(title),
                  lineHeight: 1.15,
                  letterSpacing: '-0.01em',
                  color: TEXT,
                }}
              >
                {title}
              </div>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', height: 12, background: PRIMARY }} />
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts,
      headers: { 'Cache-Control': cacheControl },
    }
  )
}
