import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'

vi.mock('@/composables/useI18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}))

describe('useTheme', () => {
  let matchMediaDark = false

  beforeEach(() => {
    vi.resetModules()
    localStorage.clear()
    document.documentElement.classList.remove('dark')
    matchMediaDark = false
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string) => ({ matches: query === '(prefers-color-scheme: dark)' ? matchMediaDark : false }) as MediaQueryList,
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  async function load() {
    return import('./useTheme')
  }

  describe('writeThemeToStorage', () => {
    it('writes theme value to localStorage', async () => {
      const { writeThemeToStorage } = await load()
      writeThemeToStorage('dark')
      expect(localStorage.getItem('nrm-desktop-theme')).toBe('"dark"')
    })
  })

  describe('useTheme', () => {
    it('defaults to auto when localStorage is empty', async () => {
      const { useTheme } = await load()
      const { theme } = useTheme()
      expect(theme.value).toBe('auto')
    })

    it('reads saved theme from localStorage', async () => {
      localStorage.setItem('nrm-desktop-theme', '"dark"')
      const { useTheme } = await load()
      const { theme } = useTheme()
      expect(theme.value).toBe('dark')
    })

    it('isDark is true for dark theme', async () => {
      const { useTheme } = await load()
      const { setTheme, isDark } = useTheme()
      setTheme('dark')
      expect(isDark.value).toBe(true)
    })

    it('isDark is false for light theme', async () => {
      const { useTheme } = await load()
      const { setTheme, isDark } = useTheme()
      setTheme('light')
      expect(isDark.value).toBe(false)
    })

    it('isDark follows matchMedia for auto theme', async () => {
      matchMediaDark = true
      const { useTheme } = await load()
      const { setTheme, isDark } = useTheme()
      setTheme('auto')
      expect(isDark.value).toBe(true)
    })

    it('toggle cycles through auto → dark → light → auto', async () => {
      const { useTheme } = await load()
      const { theme, toggle } = useTheme()

      theme.value = 'auto'
      toggle()
      expect(theme.value).toBe('dark')

      toggle()
      expect(theme.value).toBe('light')

      toggle()
      expect(theme.value).toBe('auto')
    })

    it('setTheme writes to localStorage and toggles html.dark class', async () => {
      const { useTheme } = await load()
      const { setTheme } = useTheme()

      setTheme('dark')
      expect(localStorage.getItem('nrm-desktop-theme')).toBe('"dark"')
      expect(document.documentElement.classList.contains('dark')).toBe(true)

      setTheme('light')
      expect(document.documentElement.classList.contains('dark')).toBe(false)
    })

    it('nextLabel returns the correct key for each theme', async () => {
      const { useTheme } = await load()
      const { theme, nextLabel } = useTheme()

      theme.value = 'auto'
      expect(nextLabel.value).toBe('app.settings.themeDark')

      theme.value = 'dark'
      expect(nextLabel.value).toBe('app.settings.themeLight')

      theme.value = 'light'
      expect(nextLabel.value).toBe('app.settings.themeFollowSystem')
    })
  })
})
