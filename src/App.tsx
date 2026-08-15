import { observer } from 'mobx-react-lite';
import { Sidebar } from './components/Sidebar';
import { TransportBar } from './components/TransportBar';
import { AbcEditorPanel } from './components/AbcEditorPanel';
import { SplitPane } from './components/SplitPane';
import { SheetView } from './notation/SheetView';
import { libraryStore, playbackStore, editorStore, uiStore } from './stores';

const App = observer(function App() {
  const selected = libraryStore.selected;
  const abcSource = editorStore.currentAbcSource(selected);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-white">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TransportBar />
        <SplitPane
          left={
            <SheetView
              abcSource={abcSource}
              cursor={playbackStore.cursor}
              selectionStart={playbackStore.loopStart}
              selectionEnd={playbackStore.loopEnd}
              numeralMode={uiStore.numeralMode}
              onSelectionChange={playbackStore.setSelectionRange}
            />
          }
          right={
            <AbcEditorPanel
              entry={selected}
              value={editorStore.textFor(selected)}
              edited={editorStore.isEdited(selected)}
              hasOverride={libraryStore.hasOverride(selected.key)}
              saveStatus={editorStore.saveStatus.get(selected.key ?? selected.id)}
              saveError={editorStore.saveError.get(selected.key ?? selected.id)}
              onChange={(text) => editorStore.setText(selected, text)}
              onReset={() => editorStore.resetText(selected)}
              onSave={() => editorStore.save(selected)}
            />
          }
        />
      </div>
    </div>
  );
});

export default App;
