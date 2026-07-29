import type { Environment } from 'nunjucks';
import { hhmm, humandate, yyyymmdd } from './dateformat.ts';

/*
 * Nunjucks date filters over the Temporal-based formatters.
 */
export const install = (env: Environment): void => {
  env.addFilter('yyyymmdd', yyyymmdd);
  env.addFilter('hhmm', hhmm);
  env.addFilter('humandate', humandate);
};
