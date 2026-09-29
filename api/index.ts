// Vercel serverless entry. vercel.json rewrites every /api/* request here and
// Express routes it using the original URL.
import {app} from '../server/src/app.js';

export default app;
