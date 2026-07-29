/*
 * Transitional declarations for untyped npm packages. Both filters are
 * replaced by local filter modules in the server-structure phase of the
 * modernization, at which point this file goes away.
 */

declare module 'nunjucks-date-filter' {
  import type { Environment } from 'nunjucks';

  const filter: { install(env: Environment): void };
  export default filter;
}

declare module 'nunjucks-markdown-filter' {
  import type { Environment } from 'nunjucks';

  const filter: { install(env: Environment): void };
  export default filter;
}
