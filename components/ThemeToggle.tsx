'use client'

import type { ComponentType, SVGProps } from 'react'
import { ComputerDesktopIcon, MoonIcon, SunIcon } from '@heroicons/react/24/outline'
import { THEME_COOKIE, THEMES } from '../lib/theme'
import type { Theme } from '../lib/theme'

const ONE_YEAR_SECONDS = 31_536_000

const options: Record<Theme, { label: string; Icon: ComponentType<SVGProps<SVGSVGElement>> }> = {
  system: { label: 'System theme', Icon: ComputerDesktopIcon },
  light: { label: 'Light theme', Icon: SunIcon },
  dark: { label: 'Dark theme', Icon: MoonIcon },
}

// Stores the choice in the theme cookie and applies it to <html> at once;
// the root layout renders the same attribute from the cookie on the next
// request. System removes data-theme so globals.css follows the OS.
function applyTheme(value: Theme) {
  document.cookie = `${THEME_COOKIE}=${value}; Path=/; Max-Age=${ONE_YEAR_SECONDS}; SameSite=Lax`
  if (value === 'system') {
    document.documentElement.removeAttribute('data-theme')
  } else {
    document.documentElement.dataset.theme = value
  }
}

// Controlled: SiteHeader owns the choice, so the header and menu copies
// agree, and the menu copy keeps it across the dialog unmounting.
export default function ThemeToggle({
  theme,
  onChange,
}: {
  theme: Theme
  onChange: (value: Theme) => void
}) {
  function choose(value: Theme) {
    applyTheme(value)
    onChange(value)
  }

  return (
    <div
      role="group"
      aria-label="Color theme"
      className="inline-flex rounded-md border border-border p-0.5"
    >
      {THEMES.map((value) => {
        const { label, Icon } = options[value]
        const pressed = value === theme
        return (
          <button
            key={value}
            type="button"
            aria-pressed={pressed}
            onClick={() => choose(value)}
            className={`inline-flex h-8 w-8 items-center justify-center rounded ${
              pressed ? 'bg-primary-soft text-on-primary-soft' : 'text-muted hover:text-text'
            }`}
          >
            <span className="sr-only">{label}</span>
            <Icon className="h-5 w-5" aria-hidden="true" />
          </button>
        )
      })}
    </div>
  )
}
