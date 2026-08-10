## Main Purpose
A Jazz transription/lick library (ala David Baker).

With a musical notation-sheet view, which can load these transcription entries.

## Sheet View Requirements
* It should parse abc notation for simple melodies with RealBook chords on top

* It should be able to play back the music with a realtime play cursor.

* User should be able to select notes or measures so one can loop a certain region of the music.

* Chords should be on top as text like in a Real Book.

# Dependencies
* vite React typescript
* Mobx for state management
* abcjs just for music playback NOT for notation (I'd like to have full control over interactivity with the sheet music)
* Tailwind for styling

# Music samples
piano and acoustic bass smaples can be found in ./numeric-licks-abc/public/sf/FluidR3_GM


