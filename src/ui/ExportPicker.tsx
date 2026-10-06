/** The Zobaze Export file input, shared by the start screen and "Load a new Export". */
export function ExportPicker({ onFile }: { onFile: (file: File) => void }) {
  return (
    <label className="mt-4 block text-sm font-medium">
      Zobaze Export
      <input
        type="file"
        accept=".xlsx,.xls,.csv"
        className="mt-1 block w-full text-sm"
        onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
      />
    </label>
  );
}
