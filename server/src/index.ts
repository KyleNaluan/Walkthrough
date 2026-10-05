import {app} from './app.js';
import {getEnv} from './config/env.js';

const {PORT} = getEnv();

app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`);
});
