/*
 * Hand-written declaration for @peterseibel/bhs-calendars, which ships
 * plain JSON data (every year of every BHS-area school, tagged with a
 * school id) and no types of its own.
 */

declare module '@peterseibel/bhs-calendars' {
  import type { YearData } from '@peterseibel/bells';

  const calendars: (YearData & { id: string })[];
  export default calendars;
}
