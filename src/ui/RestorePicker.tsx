/** The backup file input, on the start screen (a fresh phone) and the Report screen. */
export function RestorePicker({ onFile }: { onFile: (file: File) => void }) {
  return (
    <label className="mt-3 block text-sm font-medium">
      Restore a backup
      <input
        type="file"
        accept=".json,application/json"
        className="mt-1 block w-full rounded-xl border-2 border-dashed border-slate-300 p-3 text-base file:mr-3 file:h-11 file:rounded-xl file:border-0 file:bg-white file:px-4 file:font-semibold file:text-slate-700 file:ring-2 file:ring-slate-300"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = ''; // allow choosing the same file again
          if (file) onFile(file);
        }}
      />
    </label>
  );
}
