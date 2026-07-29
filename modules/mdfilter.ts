import createDOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';
import { marked } from 'marked';
import type { Environment } from 'nunjucks';

/*
 * Nunjucks 'md' filter: markdown to HTML, sanitized with DOMPurify so
 * student-entered text can be piped through | safe.
 */

// jsdom's DOMWindow lacks the (optional at runtime) trustedTypes property
// dompurify's WindowLike type wants, hence the cast.
const purify = createDOMPurify(
  new JSDOM('').window as unknown as Parameters<typeof createDOMPurify>[0],
);

export const md = (text: string | null | undefined): string =>
  purify.sanitize(marked.parse(text ?? '', { async: false }));

export const install = (env: Environment): void => {
  env.addFilter('md', md);
};
