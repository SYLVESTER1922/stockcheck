/** The Zobaze Export file input, shared by the start screen and "Load a new Export". */
export function ExportPicker({ onFile }: { onFile: (file: File) => void }) {
  return (
    <label className="mt-4 block text-sm font-medium">
      Zobaze Export
      <input
        type="file"
        accept=".xlsx,.xls,.csv"
        className="mt-1 block w-full rounded-xl border-2 border-dashed border-slate-300 p-3 text-base file:mr-3 file:h-11 file:rounded-xl file:border-0 file:bg-brand-blue file:px-4 file:font-semibold file:text-white"
        onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
      />
    </label>
  );
}
