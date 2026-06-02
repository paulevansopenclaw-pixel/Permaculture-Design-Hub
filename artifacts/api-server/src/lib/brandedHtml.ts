const BRAND_TITLE = "Pattern — Natural Systems Design";
const BRAND_DESCRIPTION =
  "Pattern — Natural Systems Design by Wattle Seed Permaculture. Design regenerative, resilient properties with site analysis, terrain mapping, and collaborative permaculture planning.";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface BrandedHtmlOptions {
  /** Absolute URL to the Pattern Open Graph share image. */
  ogImageUrl: string;
  title?: string;
  description?: string;
  /** Visible body heading. Defaults to the title. */
  heading?: string;
  /** Optional visible body paragraph. Defaults to the description. */
  body?: string;
  /** Canonical/Open Graph URL for this page. */
  pageUrl?: string;
}

/**
 * Render a minimal branded HTML document that carries the Pattern Open Graph
 * and Twitter preview metadata. Any HTML the API serves should go through this
 * helper so shared links unfurl with the Pattern logo.
 */
export function renderBrandedHtml(options: BrandedHtmlOptions): string {
  const title = options.title ?? BRAND_TITLE;
  const description = options.description ?? BRAND_DESCRIPTION;
  const heading = options.heading ?? title;
  const body = options.body ?? description;
  const { ogImageUrl, pageUrl } = options;

  const ogUrlTag = pageUrl
    ? `\n    <meta property="og:url" content="${escapeHtml(pageUrl)}" />`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:type" content="website" />${ogUrlTag}
    <meta property="og:image" content="${escapeHtml(ogImageUrl)}" />
    <meta property="og:image:width" content="1280" />
    <meta property="og:image:height" content="720" />
    <meta property="og:image:alt" content="Pattern — Natural Systems Design by Wattle Seed Permaculture" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    <meta name="twitter:image" content="${escapeHtml(ogImageUrl)}" />
    <style>
      :root { color-scheme: dark; }
      body {
        margin: 0;
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #1c2417;
        color: #e8e6dd;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        text-align: center;
        padding: 2rem;
      }
      main { max-width: 36rem; }
      h1 { font-size: 1.6rem; font-weight: 600; margin: 0 0 0.75rem; }
      p { font-size: 1rem; line-height: 1.5; color: #b9c1ab; margin: 0; }
    </style>
  </head>
  <body>
    <main>
      <h1>${escapeHtml(heading)}</h1>
      <p>${escapeHtml(body)}</p>
    </main>
  </body>
</html>
`;
}
