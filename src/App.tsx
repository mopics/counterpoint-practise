import { observer } from 'mobx-react-lite';
import { Sidebar } from './components/Sidebar';
import { TransportBar } from './components/TransportBar';
import { AbcEditorPanel } from './components/AbcEditorPanel';
import { SplitPane } from './components/SplitPane';
import { SheetView } from './notation/SheetView';
import { libraryStore, playbackStore, editorStore, uiStore } from './stores';

const App = observer(function App() {
  const selected = libraryStore.selected;

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-white">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TransportBar />
        {libraryStore.loadError ? (
          <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-slate-500">
            Can&apos;t reach the persistence server. Start it with{' '}
            <code className="mx-1 rounded bg-slate-100 px-1.5 py-0.5 font-mono">npm run server</code>, then reload.
          </div>
        ) : !libraryStore.loaded ? (
          <div className="flex flex-1 items-center justify-center text-sm text-slate-500">Loading your library…</div>
        ) : !selected ? (
          <div className="flex flex-1 items-center justify-center text-sm text-slate-500">
            No tunes yet — create one from the sidebar.
          </div>
        ) : (
          <SplitPane
            first={
              <SheetView
                abcSource={editorStore.currentAbcSource(selected)}
                cursor={playbackStore.cursor}
                selectionStart={playbackStore.loopStart}
                selectionEnd={playbackStore.loopEnd}
                numeralMode={uiStore.numeralMode}
                zodiacMode={uiStore.zodiacMode}
                onSelectionChange={playbackStore.setSelectionRange}
              />
            }
            second={
              <AbcEditorPanel
                entry={selected}
                value={editorStore.textFor(selected)}
                edited={editorStore.isEdited(selected)}
                saveStatus={editorStore.saveStatus.get(selected.id)}
                saveError={editorStore.saveError.get(selected.id)}
                onChange={(text) => editorStore.setText(selected, text)}
                onReset={() => editorStore.resetText(selected)}
                onSave={() => editorStore.save(selected)}
              />
            }
            maxSecondSize={1300}
          />
        )}
      </div>
    </div>
  );
});

export default App;
