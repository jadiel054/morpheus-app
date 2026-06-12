export function HudOverlay() {
  return (
    <div className="scanline-overlay pointer-events-none fixed inset-0 z-50">
      <div className="absolute top-0 left-0 w-full h-full bg-[repeating-linear-gradient(0deg,transparent,transparent_2px,rgba(0,255,255,0.015)_2px,rgba(0,255,255,0.015)_4px)]" />
    </div>
  )
}
