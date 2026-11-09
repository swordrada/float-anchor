import { useEffect, type ImgHTMLAttributes } from 'react'
import { useStore } from '../store'

/** Preserve the sea-light F and adapt its tile to the application theme. */
export default function BrandLogo(props: Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'>) {
  const dark = useStore((state) => state.settings.theme === 'dark')
  const src = dark ? './float-anchor-logo-dark.svg' : './float-anchor-logo.svg'
  useEffect(() => {
    const favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
    if (favicon) favicon.href = src
  }, [src])
  return <img {...props} src={src} />
}
