import type { MetadataRoute } from "next";
import { getAllPostsMeta } from "@/lib/blog";
import { resolveSiteUrl } from "@/lib/site";
import { hasServerSupabaseEnv, supabaseAdmin } from "@/lib/supabase/server";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = resolveSiteUrl();
  const now = new Date();
  const blogPosts = getAllPostsMeta();

  const staticUrls: MetadataRoute.Sitemap = [
    {
      url: `${siteUrl}/`,
      lastModified: now,
      changeFrequency: "hourly",
      priority: 1,
    },
    {
      url: `${siteUrl}/submit`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.6,
    },
    {
      url: `${siteUrl}/advertise`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${siteUrl}/blog`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.8,
    },
    {
      url: `${siteUrl}/feed.xml`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.4,
    },
  ];

  const blogUrls: MetadataRoute.Sitemap = blogPosts.map((post) => ({
    url: `${siteUrl}/blog/${post.slug}`,
    lastModified: new Date(post.publishedAt),
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  if (!hasServerSupabaseEnv) {
    return [...staticUrls, ...blogUrls];
  }

  // Only publish approved startups in the sitemap.
  const { data: startups, error } = await supabaseAdmin
    .from("startups")
    .select("id, updated_at")
    .eq("status", "approved")
    .order("updated_at", { ascending: false })
    .limit(50000);

  if (error) {
    return [...staticUrls, ...blogUrls];
  }

  const dynamicUrls: MetadataRoute.Sitemap = (startups ?? [])
    .map((row: any) => ({
      url: `${siteUrl}/startup/${row.id}`,
      lastModified: row.updated_at ? new Date(String(row.updated_at)) : now,
      changeFrequency: "daily" as const,
      priority: 0.7,
    }))
    .filter((entry) => Boolean(entry.url));

  return [...staticUrls, ...blogUrls, ...dynamicUrls];
}
