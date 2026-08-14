import { describe, it, expect } from 'vitest';
import { extractYouTubeVideoId } from './youtubeUrl';

describe('extractYouTubeVideoId', () => {
  it('extracts the ID from a standard watch URL', () => {
    expect(extractYouTubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  it('extracts the ID when extra query params follow v=', () => {
    expect(extractYouTubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s')).toBe('dQw4w9WgXcQ');
  });

  it('extracts the ID when extra query params precede v=', () => {
    expect(extractYouTubeVideoId('https://www.youtube.com/watch?list=PL123&v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  it('extracts the ID from a youtu.be short URL', () => {
    expect(extractYouTubeVideoId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  it('extracts the ID from an embed URL', () => {
    expect(extractYouTubeVideoId('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  it('accepts a bare 11-character video ID typed directly', () => {
    expect(extractYouTubeVideoId('dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  it('trims surrounding whitespace before matching', () => {
    expect(extractYouTubeVideoId('  dQw4w9WgXcQ  ')).toBe('dQw4w9WgXcQ');
  });

  it('returns null for an empty string', () => {
    expect(extractYouTubeVideoId('')).toBeNull();
  });

  it('returns null for an unparseable URL', () => {
    expect(extractYouTubeVideoId('https://example.com/not-a-video')).toBeNull();
  });

  it('returns null for a string that is almost a valid ID but the wrong length', () => {
    expect(extractYouTubeVideoId('short')).toBeNull();
  });
});
