import AdRailsScaffold from "@/components/AdRailsScaffold";
import HomeCenterPanel from "@/components/HomeCenterPanel";
import { toAbsoluteSiteUrl } from "@/lib/site";

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
      target: `${toAbsoluteSiteUrl("/")}?q={search_term_string}`,
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
      <AdRailsScaffold mainClassName="page page-home">
        <HomeCenterPanel />
      </AdRailsScaffold>
    </>
  );
}
