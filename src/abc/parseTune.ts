import * as abcjs from 'abcjs';

export function parseTune(abcSource: string): abcjs.TuneObject {
  const tunes = abcjs.parseOnly(abcSource);
  return tunes[0];
}
