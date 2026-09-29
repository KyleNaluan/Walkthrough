import express, {type NextFunction, type Request, type Response} from 'express';

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

app.use('/api', (_req, res) => {
  res.status(404).json({error: 'Not found'});
});

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({error: 'Internal server error'});
});
