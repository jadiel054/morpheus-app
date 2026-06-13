import { useState, useEffect } from 'react'

export const isMobile  = () => window.innerWidth < 768
export const isTablet  = () => window.innerWidth >= 768 && window.innerWidth < 1024
export const isDesktop = () => window.innerWidth >= 1024
export const isTouchDevice = () => 'ontouchstart' in window

export function useDeviceType() {
  const [device, setDevice] = useState('mobile')
  useEffect(() => {
    const update = () => {
      if (window.innerWidth >= 1024) setDevice('desktop')
      else if (window.innerWidth >= 768) setDevice('tablet')
      else setDevice('mobile')
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])
  return device
}
