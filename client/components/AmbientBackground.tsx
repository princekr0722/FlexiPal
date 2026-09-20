/**
 * Ambient motion behind the search screen. Nothing here is decoration for its
 * own sake: the drifting orbs give the page a pulse, and the rising specks read
 * as candidates surfacing out of a pool, which is what the product does.
 *
 * Slow enough not to compete with the cursor — 17 to 21 second loops — but with
 * real amplitude, and entirely disabled under prefers-reduced-motion.
 *
 * Note the z-0, not -z-10: a negative z-index paints before the in-flow
 * backgrounds of ancestors, and every ancestor here carries bg-surface-warm,
 * so the whole layer was being painted over. The content is lifted to z-10.
 */

// Fixed positions rather than random, so the composition is designed and the
// layout is identical on every render.
const SPECKS = [
  { left: '10%', top: '68%', delay: '0s', size: 8 },
  { left: '22%', top: '82%', delay: '1.1s', size: 6 },
  { left: '34%', top: '74%', delay: '2.4s', size: 10 },
  { left: '47%', top: '88%', delay: '3.6s', size: 7 },
  { left: '59%', top: '76%', delay: '1.8s', size: 9 },
  { left: '71%', top: '84%', delay: '4.4s', size: 6 },
  { left: '84%', top: '72%', delay: '5.5s', size: 8 },
  { left: '92%', top: '86%', delay: '2.9s', size: 6 },
  { left: '16%', top: '40%', delay: '4.9s', size: 7 },
  { left: '82%', top: '36%', delay: '6.2s', size: 9 },
]

export function AmbientBackground() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      {/* Soft colour fields, each drifting on its own clock. */}
      <div className="animate-orb-a absolute -top-40 left-1/5 size-[34rem] rounded-pill bg-accent/55 blur-3xl" />
      <div className="animate-orb-b absolute -right-32 top-1/5 size-[30rem] rounded-pill bg-market-band/45 blur-3xl" />
      <div className="animate-orb-c absolute -left-32 bottom-[-6rem] size-[28rem] rounded-pill bg-pastel-pearl-blue/70 blur-3xl" />

      {/* A faint dot grid, so the motion has something to move against. */}
      <div
        className="absolute inset-0 opacity-70"
        style={{
          backgroundImage: 'radial-gradient(var(--color-market-accent-border) 1px, transparent 1px)',
          backgroundSize: '28px 28px',
          maskImage: 'radial-gradient(ellipse 70% 55% at 50% 40%, #000 30%, transparent 75%)',
          WebkitMaskImage: 'radial-gradient(ellipse 70% 55% at 50% 40%, #000 30%, transparent 75%)',
        }}
      />

      {/* Specks surfacing out of the pool. */}
      {SPECKS.map((s, i) => (
        <span
          key={i}
          className="animate-surface absolute rounded-pill bg-market-band shadow-[0_0_12px_var(--color-market-band)]"
          style={{
            left: s.left,
            top: s.top,
            width: s.size,
            height: s.size,
            animationDelay: s.delay,
          }}
        />
      ))}
    </div>
  )
}
