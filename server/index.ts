import path from 'node:path';
import { createDefaultApp } from './app.ts';

const PORT = Number(process.env.PORT ?? 3001);
const DATA_DIR = path.join(process.cwd(), 'server', 'data');

const app = createDefaultApp(DATA_DIR);

app.listen(PORT, () => {
  console.log(`Tune persistence server listening on http://localhost:${PORT}`);
});
