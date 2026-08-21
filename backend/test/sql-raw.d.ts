// `?raw` imports (Vite): the WMS suite reads the migration SQL as text to check
// the seeded movement reasons against their TS mirror.
declare module '*.sql?raw' {
  const content: string;
  export default content;
}
