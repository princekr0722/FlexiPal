/** Paging for the results column — 47 matches is common and a wall of cards is not readable. */
export function Pager({
  page, pages, total, from, to, onPage,
}: {
  page: number
  pages: number
  total: number
  from: number
  to: number
  onPage: (p: number) => void
}) {
  if (pages <= 1) return null

  const nums: Array<number | '…'> = []
  for (let i = 0; i < pages; i++) {
    if (i === 0 || i === pages - 1 || Math.abs(i - page) <= 1) nums.push(i)
    else if (nums.at(-1) !== '…') nums.push('…')
  }

  return (
    <nav className="mt-4 flex items-center justify-between border-t border-surface-warm-hairline pt-3">
      <span className="font-mono text-body-xs text-text-subtle">
        {from}–{to} of {total}
      </span>
      <div className="flex items-center gap-1">
        <Step label="‹" disabled={page === 0} onClick={() => onPage(page - 1)} />
        {nums.map((n, i) =>
          n === '…' ? (
            <span key={`gap${i}`} className="px-1 text-body-xs text-text-subtle">…</span>
          ) : (
            <button
              key={n}
              onClick={() => onPage(n)}
              className={`size-7 cursor-pointer rounded-md font-mono text-body-xs transition ${
                n === page
                  ? 'bg-primary text-white'
                  : 'text-text-muted hover:bg-market-hover hover:text-primary'
              }`}
            >
              {n + 1}
            </button>
          ),
        )}
        <Step label="›" disabled={page === pages - 1} onClick={() => onPage(page + 1)} />
      </div>
    </nav>
  )
}

function Step({ label, disabled, onClick }: { label: string; disabled: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="size-7 cursor-pointer rounded-md text-text-muted transition hover:bg-market-hover hover:text-primary disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
    >
      {label}
    </button>
  )
}
