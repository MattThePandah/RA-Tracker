import { useEffect } from 'react'
import { applySiteTheme } from '../utils/siteTheme.js'

export default function useSiteTheme(theme) {
  useEffect(() => {
    applySiteTheme(theme)
  }, [theme])
}
