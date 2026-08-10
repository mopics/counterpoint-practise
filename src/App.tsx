import { observer } from 'mobx-react-lite';
import { Sidebar } from './components/Sidebar';
import { TransportBar } from './components/TransportBar';
import { SheetView } from './notation/SheetView';
import { libraryStore, playbackStore } from './stores';

const App = observer(function App() {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-white">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TransportBar />
        <div className="min-h-0 flex-1 overflow-auto">
          <SheetView
            abcSource={libraryStore.selected.data ?? ''}
            cursor={playbackStore.cursor}
            selectionStart={playbackStore.loopStart}
            selectionEnd={playbackStore.loopEnd}
            onSelectionChange={playbackStore.setSelectionRange}
          />
        </div>
      </div>
    </div>
  );
});

export default App;
