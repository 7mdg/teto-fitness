/** Opens the system file picker and resolves with the chosen file's text (null if cancelled). */
export function pickTextFile(accept = '.json,application/json'): Promise<{ name: string; text: string } | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';
    document.body.appendChild(input);
    let settled = false;
    const done = (v: { name: string; text: string } | null) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(v);
    };
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return done(null);
      done({ name: file.name, text: await file.text() });
    });
    input.addEventListener('cancel', () => done(null));
    input.click();
  });
}

/** Shares several files in one Share sheet when supported; otherwise downloads them one by one. */
export async function shareFiles(files: { name: string; type: string; text: string }[]): Promise<'shared' | 'cancelled' | 'downloaded'> {
  const list = files.map((f) => new File([f.text], f.name, { type: f.type }));
  if (navigator.canShare?.({ files: list })) {
    try {
      await navigator.share({ files: list });
      return 'shared';
    } catch {
      return 'cancelled';
    }
  }
  for (const f of files) await shareFile(f.name, f.type, f.text);
  return 'downloaded';
}

/** Shares a file via the iOS Share sheet, falling back to a download. */
export async function shareFile(name: string, type: string, text: string): Promise<'shared' | 'cancelled' | 'downloaded'> {
  const file = new File([text], name, { type });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return 'shared';
    } catch {
      return 'cancelled';
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'downloaded';
}
