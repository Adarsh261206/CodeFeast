import { useEffect, useRef } from 'react'

// Lightweight animated starfield with a subtle 3D parallax feel
// No dependencies; uses 2D canvas and requestAnimationFrame
export default function BackgroundCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let width = (canvas.width = window.innerWidth)
    let height = (canvas.height = window.innerHeight)

    const onResize = () => {
      width = canvas.width = window.innerWidth
      height = canvas.height = window.innerHeight
    }
    window.addEventListener('resize', onResize)

    type Particle = { x: number; y: number; z: number; vx: number; vy: number }
    const particles: Particle[] = []
    const DEPTH = 400
    const COUNT = Math.min(150, Math.floor((width * height) / 16000))

    for (let i = 0; i < COUNT; i++) {
      particles.push({
        x: (Math.random() - 0.5) * width,
        y: (Math.random() - 0.5) * height,
        z: Math.random() * DEPTH + 1,
        vx: (Math.random() - 0.5) * 0.15,
        vy: (Math.random() - 0.5) * 0.15
      })
    }

    const draw = () => {
      ctx.clearRect(0, 0, width, height)
      // Subtle vignette
      const grad = ctx.createRadialGradient(
        width * 0.5,
        height * 0.4,
        Math.min(width, height) * 0.1,
        width * 0.5,
        height * 0.6,
        Math.max(width, height) * 0.8
      )
      grad.addColorStop(0, 'rgba(20,25,45,0.2)')
      grad.addColorStop(1, 'rgba(8,10,20,0.6)')
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, width, height)

      for (const p of particles) {
        // Update
        p.x += p.vx
        p.y += p.vy
        p.z -= 0.6
        if (p.z <= 0.5) p.z = DEPTH

        // Wrap
        const limitX = width * 0.6
        const limitY = height * 0.6
        if (p.x < -limitX) p.x = limitX
        if (p.x > limitX) p.x = -limitX
        if (p.y < -limitY) p.y = limitY
        if (p.y > limitY) p.y = -limitY

        // Project to 2D (simple perspective)
        const scale = 200 / (p.z + 200)
        const sx = width / 2 + p.x * scale
        const sy = height / 2 + p.y * scale
        const size = Math.max(0.5, 2.5 * scale)

        // Color with slight hue shift for depth
        const hue = 265 + (1 - scale) * 40
        ctx.fillStyle = `hsla(${hue},70%,70%,0.7)`
        ctx.beginPath()
        ctx.arc(sx, sy, size, 0, Math.PI * 2)
        ctx.fill()
      }

      rafRef.current = requestAnimationFrame(draw)
    }

    draw()
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 -z-20"
      aria-hidden="true"
    />
  )
}


