/**
 * Local ambient declaration for the `jsdom` package.
 *
 * jsdom 29 ships no type declarations of its own, and pulling in
 * `@types/jsdom` reintroduces exactly the local-vs-CI strict-ratchet
 * divergence that `server/_core/sanitize-html.d.ts` documents (PR #282).
 * Declaring the surface we actually use keeps resolution deterministic.
 *
 * Surface area covered:
 *   - `new JSDOM(html, { url })`
 *   - `dom.window.document`
 *
 * That is the whole of what `server/companyWebsiteSource.ts` needs: parse a
 * fetched page and query it. Extend this file if a caller needs more, rather
 * than adding a types package.
 */
declare module "jsdom" {
  interface ConstructorOptions {
    /** Base URL for the document, used to resolve relative hrefs. */
    url?: string;
    contentType?: string;
    referrer?: string;
    includeNodeLocations?: boolean;
    pretendToBeVisual?: boolean;
  }

  class JSDOM {
    constructor(html?: string, options?: ConstructorOptions);
    readonly window: { document: Document };
    serialize(): string;
  }

  export { JSDOM, ConstructorOptions };
}
