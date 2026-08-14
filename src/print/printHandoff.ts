const STORAGE_KEY = 'printPayload';

export interface PrintPayload {
  abc: string;
  title: string;
}

/** Hands the current tune's ABC text + title to a freshly opened /print window (no shared JS memory across windows). */
export function writePrintPayload(abc: string, title: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ abc, title }));
  } catch {
    // ignore persistence failures (e.g. private browsing / storage disabled)
  }
}

export function readPrintPayload(): PrintPayload | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PrintPayload>;
    if (typeof parsed.abc !== 'string' || typeof parsed.title !== 'string') return null;
    return { abc: parsed.abc, title: parsed.title };
  } catch {
    return null;
  }
}
