// Helpers for triggering browser downloads from data URLs / blobs.

export function downloadDataURL(dataURL: string, filename: string): void {
  const a = document.createElement('a');
  a.href = dataURL;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** Slugify a title into a safe filename stem. */
export function toFilename(title: string, ext: string): string {
  const stem = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${stem || 'drawley-artwork'}.${ext}`;
}

/** Trigger a JSON file download (project export). */
export function downloadJSON(obj: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(obj)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  downloadDataURL(url, filename);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
