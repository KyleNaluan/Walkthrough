import express from 'express';
import {errorHandler} from './lib/errors.js';
import {authRouter} from './routes/auth.js';
import {inspectionsRouter} from './routes/inspections.js';
import {storesRouter} from './routes/stores.js';
import {ticketsRouter} from './routes/tickets.js';

/**
 * The Express app, without listen(). Shared by local dev (src/index.ts),
 * tests (SuperTest) and the Vercel function (api/index.ts).
 */
export const app = express();

app.disable('x-powered-by');
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({status: 'ok'});
});

app.use('/api', authRouter, storesRouter, inspectionsRouter, ticketsRouter);

app.use('/api', (_req, res) => {
  res.status(404).json({error: 'Not found'});
});

app.use(errorHandler);
