import type { Metadata } from "next";
import RoundtableLandingPage from "@/components/roundtable/RoundtableLandingPage";
import RoundtableRoomPageShell from "@/components/roundtable/RoundtableRoomPageShell";
import { getHomepageSessionId } from "@/lib/roundtable/queries";
import { toAbsoluteSiteUrl } from "@/lib/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Roundtable Room | StartupManch",
  description: "Join the default live startup roundtable room and participate in timed text turns.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Roundtable Room | StartupManch",
    description: "Join the default live startup roundtable room and participate in timed text turns.",
    url: "/",
    siteName: "StartupManch",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Roundtable Room | StartupManch",
    description: "Join the default live startup roundtable room and participate in timed text turns.",
  },
};

export default async function Home() {
  let sessionId: string | null = null;
  try {
    sessionId = await getHomepageSessionId();
  } catch {
    sessionId = null;
  }
  const organizationSchema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "StartupManch",
    url: toAbsoluteSiteUrl("/"),
  };

  const websiteSchema = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "StartupManch",
    url: toAbsoluteSiteUrl("/"),
    potentialAction: {
      "@type": "SearchAction",
      target: `${toAbsoluteSiteUrl("/roundtable")}?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteSchema) }}
      />
      {sessionId ? <RoundtableRoomPageShell sessionId={sessionId} /> : <RoundtableLandingPage />}
    </>
  );
}
