import { observer } from 'mobx-react-lite';
import { Sidebar } from './components/Sidebar';
import { TransportBar } from './components/TransportBar';
import { AbcEditorPanel } from './components/AbcEditorPanel';
import { SplitPane } from './components/SplitPane';
import { SheetView } from './notation/SheetView';
import { libraryStore, playbackStore, editorStore } from './stores';

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
              onSelectionChange={playbackStore.setSelectionRange}
            />
          }
          right={
            <AbcEditorPanel
              value={editorStore.textFor(selected)}
              edited={editorStore.isEdited(selected)}
              onChange={(text) => editorStore.setText(selected, text)}
              onReset={() => editorStore.resetText(selected)}
            />
          }
        />
      </div>
    </div>
  );
});

export default App;
