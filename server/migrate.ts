import { randomUUID } from 'node:crypto';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { FILE_TREE, type AbcData } from '../src/content/index.ts';
import type { FolderRecord, LibraryNode, TuneRecord } from './libraryStore.ts';

export function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'item';
}

/**
 * Pure conversion of the static content tree into flat, parentId-linked
 * library records. `generateId` and `now` are injected so this is fully
 * deterministic under test; `main()` below supplies the real ones.
 */
export function buildRecords(
  tree: AbcData[],
  generateId: (title: string) => string,
  now: () => string = () => new Date().toISOString(),
): LibraryNode[] {
  const records: LibraryNode[] = [];

  function walk(nodes: AbcData[], parentId: string | null): void {
    for (const node of nodes) {
      const id = generateId(node.title);
      const timestamp = now();
      if (node.children) {
        const record: FolderRecord = { id, type: 'folder', parentId, title: node.title, createdAt: timestamp, updatedAt: timestamp };
        records.push(record);
        walk(node.children, id);
      } else {
        const record: TuneRecord = {
          id,
          type: 'tune',
          parentId,
          title: node.title,
          data: node.data ?? '',
          video: node.video,
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        records.push(record);
      }
    }
  }

  walk(tree, null);
  return records;
}

async function main(): Promise<void> {
  const dataDir = path.join(process.cwd(), 'server', 'data', 'library');
  await mkdir(dataDir, { recursive: true });

  const existing = await readdir(dataDir);
  if (existing.length > 0) {
    console.error(`Refusing to migrate: ${dataDir} already contains ${existing.length} file(s). Delete them first if you really want to re-run this.`);
    process.exitCode = 1;
    return;
  }

  const records = buildRecords(FILE_TREE, (title) => `${slugify(title)}-${randomUUID().slice(0, 8)}`);
  for (const record of records) {
    await writeFile(path.join(dataDir, `${record.id}.json`), JSON.stringify(record, null, 2));
  }

  const folderCount = records.filter((r) => r.type === 'folder').length;
  const tuneCount = records.filter((r) => r.type === 'tune').length;
  console.log(`Migrated ${folderCount} folder(s) and ${tuneCount} tune(s) into ${dataDir}`);
}

// process.argv[1] is a raw OS path (backslashes, no file:// prefix on
// Windows) while import.meta.url is a properly encoded file:// URL — a
// naive string comparison between them never matches on Windows.
// pathToFileURL() normalizes argv[1] into the same URL form for a
// reliable "was this module run directly?" check on every platform.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
