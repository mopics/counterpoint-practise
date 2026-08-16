import path from 'node:path';
import { createDefaultApp } from './app.ts';

const PORT = Number(process.env.PORT ?? 3001);
const DATA_DIR = path.join(process.cwd(), 'server', 'data', 'library');

const app = createDefaultApp(DATA_DIR);

app.listen(PORT, '127.0.0.1', () => {
  console.log(`Library persistence server listening on http://localhost:${PORT}`);
});
