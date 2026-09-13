import {
  copyFileSync,
  existsSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";

const outputDir = resolve("web-build");
const file = resolve(outputDir, "index.html");
if (!existsSync(file)) process.exit(0);

const DEFAULT_SITE_URL = "https://googleautocompleta.com";
const SITE_NAME = "Google Autocompleta";
const TITLE = "Google Autocompleta | Adivina lo que España busca";
const DESCRIPTION =
  "Adivina cómo se completan búsquedas en español con retos diarios, históricos y aleatorios. Juego gratuito e independiente.";
const SEO_MARKER = /<!-- google-autocompleta-seo:start -->[\s\S]*?<!-- google-autocompleta-seo:end -->/g;

function getCanonicalUrl() {
  const configuredUrl = process.env.EXPO_PUBLIC_APP_URL?.trim() || DEFAULT_SITE_URL;
  let parsedUrl;
  try {
    parsedUrl = new URL(configuredUrl);
  } catch {
    throw new Error(
      `EXPO_PUBLIC_APP_URL must be an absolute HTTPS URL: ${configuredUrl}`,
    );
  }
  if (parsedUrl.protocol !== "https:" || parsedUrl.username || parsedUrl.password) {
    throw new Error(
      `EXPO_PUBLIC_APP_URL must be an absolute HTTPS URL: ${configuredUrl}`,
    );
  }
  return `${parsedUrl.origin}/`;
}

function escapeAttribute(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function removeExistingSeoTags(html) {
  return html
    .replace(SEO_MARKER, "")
    .replace(/<title>[\s\S]*?<\/title>/gi, "")
    .replace(/<meta\s+name=["'](?:description|robots|author|application-name|theme-color)["'][^>]*>/gi, "")
    .replace(/<meta\s+property=["']og:[^"']+["'][^>]*>/gi, "")
    .replace(/<meta\s+name=["']twitter:[^"']+["'][^>]*>/gi, "")
    .replace(/<link\s+rel=["'](?:canonical|alternate|icon|apple-touch-icon|manifest)["'][^>]*>/gi, "")
    .replace(/<script\s+type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi, "");
}

function buildStructuredData(canonicalUrl) {
  return JSON.stringify(
    {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "WebSite",
          "@id": `${canonicalUrl}#website`,
          url: canonicalUrl,
          name: SITE_NAME,
          description: DESCRIPTION,
          inLanguage: "es-ES",
        },
        {
          "@type": "WebApplication",
          "@id": `${canonicalUrl}#game`,
          url: canonicalUrl,
          name: SITE_NAME,
          description: DESCRIPTION,
          applicationCategory: "GameApplication",
          operatingSystem: "Web",
          browserRequirements: "Requires JavaScript",
          inLanguage: "es-ES",
          isAccessibleForFree: true,
          offers: {
            "@type": "Offer",
            price: "0",
            priceCurrency: "EUR",
          },
          image: `${canonicalUrl}icon-512.png`,
          author: {
            "@type": "Organization",
            name: "izbri.com",
            url: "https://izbri.com",
          },
          isPartOf: {
            "@id": `${canonicalUrl}#website`,
          },
        },
      ],
    },
    null,
    2,
  ).replaceAll("<", "\\u003c");
}

function buildSeoHead(canonicalUrl) {
  const safeCanonicalUrl = escapeAttribute(canonicalUrl);
  const safeSiteName = escapeAttribute(SITE_NAME);
  const safeTitle = escapeAttribute(TITLE);
  const safeDescription = escapeAttribute(DESCRIPTION);
  return `
    <!-- google-autocompleta-seo:start -->
    <title>${safeTitle}</title>
    <meta name="description" content="${safeDescription}" />
    <meta name="author" content="izbri.com" />
    <meta name="application-name" content="${safeSiteName}" />
    <meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1" />
    <meta name="theme-color" content="#ffffff" />
    <link rel="canonical" href="${safeCanonicalUrl}" />
    <link rel="alternate" hreflang="es-ES" href="${safeCanonicalUrl}" />
    <link rel="alternate" hreflang="x-default" href="${safeCanonicalUrl}" />
    <link rel="icon" href="/favicon.ico" sizes="any" />
    <link rel="icon" type="image/png" sizes="512x512" href="/favicon.png" />
    <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
    <link rel="manifest" href="/site.webmanifest" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="${safeSiteName}" />
    <meta property="og:locale" content="es_ES" />
    <meta property="og:url" content="${safeCanonicalUrl}" />
    <meta property="og:title" content="${safeTitle}" />
    <meta property="og:description" content="${safeDescription}" />
    <meta property="og:image" content="${safeCanonicalUrl}icon-512.png" />
    <meta property="og:image:type" content="image/png" />
    <meta property="og:image:width" content="512" />
    <meta property="og:image:height" content="512" />
    <meta property="og:image:alt" content="Icono de Google Autocompleta" />
    <meta name="twitter:card" content="summary" />
    <meta name="twitter:title" content="${safeTitle}" />
    <meta name="twitter:description" content="${safeDescription}" />
    <meta name="twitter:image" content="${safeCanonicalUrl}icon-512.png" />
    <meta name="twitter:image:alt" content="Icono de Google Autocompleta" />
    <script type="application/ld+json">${buildStructuredData(canonicalUrl)}</script>
    <!-- google-autocompleta-seo:end -->`;
}

function writeCrawlFiles(canonicalUrl) {
  writeFileSync(
    resolve(outputDir, "robots.txt"),
    `User-agent: *\nAllow: /\nSitemap: ${canonicalUrl}sitemap.xml\n`,
    "utf8",
  );
  writeFileSync(
    resolve(outputDir, "sitemap.xml"),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${canonicalUrl}</loc></url></urlset>\n`,
    "utf8",
  );
  writeFileSync(
    resolve(outputDir, "site.webmanifest"),
    `${JSON.stringify(
      {
        name: SITE_NAME,
        short_name: SITE_NAME,
        description: DESCRIPTION,
        start_url: "/",
        display: "standalone",
        background_color: "#ffffff",
        theme_color: "#ffffff",
        lang: "es-ES",
        icons: [
          {
            src: "/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
        ],
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}

function copyPublicAssets() {
  for (const [source, target] of [
    ["assets/images/favicon.png", "favicon.png"],
    ["assets/images/apple-touch-icon.png", "apple-touch-icon.png"],
    ["assets/images/icon-512.png", "icon-512.png"],
  ]) {
    copyFileSync(resolve(source), resolve(outputDir, target));
  }
}

const canonicalUrl = getCanonicalUrl();
let html = readFileSync(file, "utf8");
html = html.replace(/<html lang="[^"]*">/i, '<html lang="es">');
html = html.replace(/ maximum-scale="[^"]*"/gi, "");
html = removeExistingSeoTags(html);
html = html.replace("</head>", `${buildSeoHead(canonicalUrl)}\n  </head>`);
writeFileSync(file, html, "utf8");
copyPublicAssets();
writeCrawlFiles(canonicalUrl);

const canonicalTags = html.match(/<link\s+rel="canonical"[^>]*>/gi) ?? [];
if (canonicalTags.length !== 1) {
  throw new Error(`Expected exactly one canonical link, found ${canonicalTags.length}`);
}
if (
  !html.includes(`<title>${TITLE}</title>`) ||
  !html.includes(`name="description" content="${DESCRIPTION}"`) ||
  !html.includes('type="application/ld+json"')
) {
  throw new Error("Required SEO metadata was not written to web-build/index.html");
}
const robots = readFileSync(resolve(outputDir, "robots.txt"), "utf8");
if (!robots.includes(`Sitemap: ${canonicalUrl}sitemap.xml`)) {
  throw new Error("robots.txt does not reference the canonical sitemap");
}
const sitemap = readFileSync(resolve(outputDir, "sitemap.xml"), "utf8");
const sitemapLocations = sitemap.match(/<loc>[^<]+<\/loc>/g) ?? [];
if (sitemapLocations.length !== 1 || !sitemap.includes(`<loc>${canonicalUrl}</loc>`)) {
  throw new Error("sitemap.xml must contain exactly the canonical homepage");
}
const manifest = JSON.parse(readFileSync(resolve(outputDir, "site.webmanifest"), "utf8"));
if (manifest.start_url !== "/" || manifest.lang !== "es-ES" || !Array.isArray(manifest.icons)) {
  throw new Error("site.webmanifest is missing required app metadata");
}
for (const asset of [
  "favicon.ico",
  "favicon.png",
  "apple-touch-icon.png",
  "icon-512.png",
  "site.webmanifest",
  "robots.txt",
  "sitemap.xml",
]) {
  if (!existsSync(resolve(outputDir, asset))) {
    throw new Error(`Required web asset was not generated: ${asset}`);
  }
}
