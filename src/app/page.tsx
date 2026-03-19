import type { Metadata } from "next";
import RoundtablePrivateRoomBootstrap from "@/components/roundtable/RoundtablePrivateRoomBootstrap";
import { toAbsoluteSiteUrl } from "@/lib/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Roundtable Room | StartupManch",
  description: "Open a private StartupManch roundtable room and invite friends or founders in.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Roundtable Room | StartupManch",
    description: "Open a private StartupManch roundtable room and invite friends or founders in.",
    url: "/",
    siteName: "StartupManch",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Roundtable Room | StartupManch",
    description: "Open a private StartupManch roundtable room and invite friends or founders in.",
  },
};

export default function Home() {
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
      <RoundtablePrivateRoomBootstrap />
    </>
  );
}
