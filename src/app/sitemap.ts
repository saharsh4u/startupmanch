import type { MetadataRoute } from "next";
import { hasServerSupabaseEnv, supabaseAdmin } from "@/lib/supabase/server";

const DEFAULT_SITE_URL = "https://www.startupmanch.com";

const resolveSiteUrl = () => {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!configured) return DEFAULT_SITE_URL;
  return configured.replace(/\/+$/, "");
};

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = resolveSiteUrl();
  const now = new Date();

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
  ];

  if (!hasServerSupabaseEnv) {
    return staticUrls;
  }

  // Only publish approved startups in the sitemap.
  const { data: startups, error } = await supabaseAdmin
    .from("startups")
    .select("id, updated_at")
    .eq("status", "approved")
    .order("updated_at", { ascending: false })
    .limit(50000);

  if (error) {
    return staticUrls;
  }

  const dynamicUrls: MetadataRoute.Sitemap = (startups ?? [])
    .map((row: any) => ({
      url: `${siteUrl}/startup/${row.id}`,
      lastModified: row.updated_at ? new Date(String(row.updated_at)) : now,
      changeFrequency: "daily" as const,
      priority: 0.7,
    }))
    .filter((entry) => Boolean(entry.url));

  return [...staticUrls, ...dynamicUrls];
}
