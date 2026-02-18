import { getAllPostsMeta } from "@/lib/blog";
import { toAbsoluteSiteUrl } from "@/lib/site";

const xmlEscape = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");

export async function GET() {
  const posts = getAllPostsMeta();
  const siteUrl = toAbsoluteSiteUrl("/").replace(/\/$/, "");

  const items = posts
    .map((post) => {
      const link = `${siteUrl}/blog/${post.slug}`;
      return `
    <item>
      <title>${xmlEscape(post.title)}</title>
      <description>${xmlEscape(post.excerpt)}</description>
      <link>${xmlEscape(link)}</link>
      <guid>${xmlEscape(link)}</guid>
      <pubDate>${new Date(post.publishedAt).toUTCString()}</pubDate>
    </item>`;
    })
    .join("\n");

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>StartupManch Blog</title>
    <description>Founder and investor growth insights.</description>
    <link>${xmlEscape(siteUrl + "/blog")}</link>${items}
  </channel>
</rss>`;

  return new Response(body, {
    headers: {
      "content-type": "application/rss+xml; charset=utf-8",
    },
  });
}
