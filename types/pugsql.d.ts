/*
 * Hand-written declarations for pugsql, whose query methods are generated
 * at runtime from queries.sql and therefore can't be statically typed.
 */

declare module 'pugsql' {
  export class DB {
    // biome-ignore lint/suspicious/noExplicitAny: runtime-generated query methods have no static types.
    [query: string]: any;

    constructor(filename: string, schema?: string | null, verbose?: boolean);

    /*
     * Run fn in a transaction. Throws (and rolls back) if the transaction
     * fails.
     */
    transaction<T>(fn: () => T): T;

    /*
     * Register a custom SQL function usable in queries.
     */
    addFunction(name: string, fn: (...args: unknown[]) => unknown): this;

    /*
     * Parse named queries from a .sql file and attach them as methods.
     */
    addQueries(filename: string): this;
  }
}
