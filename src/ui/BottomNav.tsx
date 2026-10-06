export type Tab = 'home' | 'count' | 'variance' | 'report' | 'help';

type Props = { tab: Tab; hasSession: boolean; uncounted: number; onTab: (tab: Tab) => void };

/**
 * Bottom navigation, within thumb reach. Icons and the badge are aria-hidden so each button's
 * accessible name is exactly its label ("Count", "Variance", "Report", "How to count").
 */
export function BottomNav({ tab, hasSession, uncounted, onTab }: Props) {
  const tabs: { id: Tab; label: string; icon: string; show: boolean }[] = [
    { id: 'count', label: 'Count', icon: '🔢', show: hasSession },
    { id: 'variance', label: 'Variance', icon: '📊', show: hasSession },
    { id: 'report', label: 'Report', icon: '🧾', show: hasSession },
    { id: 'help', label: 'How to count', icon: '❓', show: true },
  ];

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <div className="mx-auto flex max-w-xl">
        {tabs
          .filter((t) => t.show)
          .map((t) => (
            <button
              key={t.id}
              onClick={() => onTab(t.id)}
              aria-current={tab === t.id ? 'page' : undefined}
              className={`relative flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-xs font-semibold ${
                tab === t.id ? 'text-brand-blue' : 'text-slate-500'
              }`}
            >
              <span aria-hidden className="text-lg leading-none">
                {t.icon}
              </span>
              {t.label}
              {t.id === 'count' && uncounted > 0 && (
                <span
                  aria-hidden
                  className="absolute top-1 left-1/2 ml-3 rounded-full bg-rose-600 px-1.5 text-[10px] font-bold text-white"
                >
                  {uncounted}
                </span>
              )}
            </button>
          ))}
      </div>
    </nav>
  );
}
