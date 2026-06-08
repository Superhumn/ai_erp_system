/**
 * Local ambient declaration for the `sanitize-html` package.
 *
 * The package itself does not ship types, and adding `@types/sanitize-html`
 * to devDependencies caused a confusing local-vs-CI divergence in the
 * strict ratchet (see PR #282). Declaring the surface area we use here
 * keeps the types resolution deterministic across environments — checked-in
 * code resolves identically locally, in CI, and on every contributor's box.
 *
 * Surface area covered:
 *   - `sanitizeHtml(html, options?)` → string
 *   - `sanitizeHtml.defaults.allowedTags` and `.allowedAttributes`
 *
 * If a caller needs richer typing (e.g. custom transformers), extend this
 * file rather than reintroducing `@types/sanitize-html`.
 */
declare module "sanitize-html" {
  namespace sanitizeHtml {
    interface IOptions {
      allowedTags?: string[] | false;
      allowedAttributes?: Record<string, string[]> | false;
      allowedSchemes?: string[];
      allowedSchemesByTag?: Record<string, string[]>;
      disallowedTagsMode?: "discard" | "escape" | "recursiveEscape" | "completelyDiscard";
      enforceHtmlBoundary?: boolean;
      selfClosing?: string[];
      parser?: unknown;
      transformTags?: Record<string, unknown>;
    }

    interface IDefaults {
      allowedTags: string[];
      allowedAttributes: Record<string, string[]>;
      allowedSchemes: string[];
    }

    const defaults: IDefaults;
  }

  function sanitizeHtml(dirty: string, options?: sanitizeHtml.IOptions): string;

  export = sanitizeHtml;
}
