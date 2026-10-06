import { useRegisterSW } from 'virtual:pwa-register/react';

const HOUR = 60 * 60 * 1000;

/**
 * Offline support and updates (spec §4.12). The browser checks for a new version whenever the app
 * opens; we also check hourly and when the app returns to the foreground. A new version waits for
 * the Counter to tap "Update now". Counts are saved on every change, so updating loses nothing.
 */
export function UpdateBanner() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      const check = () => navigator.onLine && registration.update().catch(() => {});
      setInterval(check, HOUR);
      document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && check());
    },
  });

  function update() {
    // The plugin only reloads if a worker already controlled the page when it opened; on a first
    // visit it doesn't. So we reload ourselves, once, when the new version takes control.
    navigator.serviceWorker.addEventListener('controllerchange', reloadOnce);
    void updateServiceWorker();
  }

  if (!needRefresh) return null;
  return (
    <div role="status" className="mt-3 flex items-center justify-between gap-2 rounded-lg bg-sky-50 p-3 text-sm text-sky-900">
      <span>A new version of StockCheck is ready. Your counts are kept.</span>
      <button onClick={update} className="shrink-0 rounded-lg bg-sky-800 px-3 py-2 font-semibold text-white">
        Update now
      </button>
    </div>
  );
}

let reloading = false;
function reloadOnce() {
  if (reloading) return;
  reloading = true;
  window.location.reload();
}
