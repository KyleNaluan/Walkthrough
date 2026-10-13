import express, {type Router} from 'express';
import {errorHandler} from '../../src/lib/errors.js';

/** A small app with the real error handler, for testing one router. */
export function testApp(router: Router): express.Express {
  const app = express();
  app.use(express.json());
  app.use(router);
  app.use(errorHandler);
  return app;
}
