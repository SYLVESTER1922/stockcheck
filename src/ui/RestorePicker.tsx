/** The backup file input, on the start screen (a fresh phone) and the Report screen. */
export function RestorePicker({ onFile }: { onFile: (file: File) => void }) {
  return (
    <label className="mt-3 block text-sm font-medium">
      Restore a backup
      <input
        type="file"
        accept=".json,application/json"
        className="mt-1 block w-full text-sm"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = ''; // allow choosing the same file again
          if (file) onFile(file);
        }}
      />
    </label>
  );
}
