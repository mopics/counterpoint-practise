export interface KeyMarker {
  charOffset: number;
  root: string;
}

const MARKER_RE = /\*\*(.*?)\*\*/g;
const VALID_ROOT_RE = /^[A-G][b#]?$/;

export function extractKeyMarkers(rawAbc: string): { cleanAbc: string; markers: KeyMarker[] } {
  const markers: KeyMarker[] = [];
  const cleanAbc = rawAbc.replace(MARKER_RE, (match, content: string, offset: number) => {
    if (VALID_ROOT_RE.test(content)) {
      markers.push({ charOffset: offset, root: content });
    }
    return ' '.repeat(match.length);
  });
  return { cleanAbc, markers };
}
