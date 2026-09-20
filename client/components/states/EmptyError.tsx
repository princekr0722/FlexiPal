import type { Bottleneck } from '../../../shared/events.ts'
import { Button, Notice } from '../primitives.tsx'

export function EmptyState({ bottleneck, onLoosen }: { bottleneck: Bottleneck | null; onLoosen: () => void }) {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <h2 className="font-heading text-2xl text-primary">Nobody came back</h2>
      <p className="mt-2 text-body-md leading-relaxed text-text-muted">
        {bottleneck
          ? `We loosened everything we safely could and ${bottleneck.humanized}. ${bottleneck.count} of 48 were ruled out by that alone.`
          : 'Every combination we tried came back empty.'}
      </p>
      <div className="mt-6">
        <Button onClick={onLoosen}>Loosen the criteria and retry</Button>
      </div>
    </div>
  )
}

export function ErrorState({
  code, message, recoverable, onRetry,
}: {
  code: string
  message: string
  recoverable: boolean
  onRetry: () => void
}) {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <h2 className="font-heading text-2xl text-primary">That did not go through</h2>
      <p className="mt-2 text-body-md leading-relaxed text-text-muted">{message}</p>
      <p className="mt-2 font-mono text-body-xs text-text-subtle">{code}</p>
      <p className="mt-4 text-body-sm text-text-subtle">
        Nothing was lost — your criteria are exactly where you left them.
      </p>
      {recoverable && (
        <div className="mt-6">
          <Button onClick={onRetry}>Try again</Button>
        </div>
      )}
    </div>
  )
}

export function WarningStack({ warnings }: { warnings: Array<{ code: string; message: string }> }) {
  if (warnings.length === 0) return null
  return (
    <div className="mb-4 space-y-2">
      {warnings.map((w) => (
        <Notice key={w.code} tone={w.code === 'degraded' ? 'degraded' : 'relaxed'}>
          {w.message}
        </Notice>
      ))}
    </div>
  )
}
