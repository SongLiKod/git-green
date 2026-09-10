import { defineStore } from 'pinia'
import { ref } from 'vue'

export type ThemeMode = 'light' | 'dark' | 'system'

export const useThemeStore = defineStore('theme', () => {
  const themeMode = ref<ThemeMode>('system')
  const actualDark = ref(false)
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')

  function calcActualDark(mode: ThemeMode): boolean {
    if (mode === 'system') return mediaQuery.matches
    return mode === 'dark'
  }

  function applyDocumentClass() {
    const html = document.documentElement
    html.classList.remove('light', 'dark')
    html.classList.add(actualDark.value ? 'dark' : 'light')
  }

  function updateTheme(mode: ThemeMode) {
    themeMode.value = mode
    actualDark.value = calcActualDark(mode)
    applyDocumentClass()
  }

  mediaQuery.addEventListener('change', () => {
    if (themeMode.value === 'system') {
      actualDark.value = mediaQuery.matches
      applyDocumentClass()
    }
  })

  function initTheme() {
    const val = localStorage.getItem('themeMode') as ThemeMode
    if (val) themeMode.value = val
    updateTheme(themeMode.value)
  }

  function setThemeMode(mode: ThemeMode) {
    localStorage.setItem('themeMode', mode)
    updateTheme(mode)
  }

  return { themeMode, actualDark, initTheme, setThemeMode }
})
