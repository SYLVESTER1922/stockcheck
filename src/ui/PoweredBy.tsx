/** "Powered by Netrisyl Insights" with the logo (T13). Plain text, not a link; start and Report screens only. */
export function PoweredBy() {
  return (
    <div data-testid="powered-by" className="mt-6 flex flex-col items-center gap-1 text-xs text-slate-600">
      <img src="/netrisyl-logo.jpg" alt="" width={150} height={40} className="h-10 w-auto rounded-md bg-white" />
      <span>Powered by Netrisyl Insights</span>
    </div>
  );
}
