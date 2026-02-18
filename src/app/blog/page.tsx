import type { Metadata } from "next";
import Link from "next/link";
import AdRailsScaffold from "@/components/AdRailsScaffold";
import LeadCaptureForm from "@/components/LeadCaptureForm";
import SiteFooter from "@/components/SiteFooter";
import TopNav from "@/components/TopNav";
import { getAllPostsMeta } from "@/lib/blog";
import { toAbsoluteSiteUrl } from "@/lib/site";

const posts = getAllPostsMeta();

export const metadata: Metadata = {
  title: "StartupManch Blog | Founder & Investor Insights",
  description:
    "Practical startup fundraising, pitch, and investor insights for India-focused founders and operators.",
  alternates: {
    canonical: "/blog",
  },
  openGraph: {
    title: "StartupManch Blog | Founder & Investor Insights",
    description:
      "Practical startup fundraising, pitch, and investor insights for India-focused founders and operators.",
    url: toAbsoluteSiteUrl("/blog"),
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "StartupManch Blog",
    description:
      "Practical startup fundraising, pitch, and investor insights for India-focused founders and operators.",
  },
};

export default function BlogIndexPage() {
  return (
    <AdRailsScaffold mainClassName="page page-home inner-rails-page">
      <TopNav context="inner" />
      <main className="blog-shell">
        <header className="blog-header">
          <p className="blog-kicker">StartupManch Blog</p>
          <h1>Founder and investor growth insights</h1>
          <p>
            Tactical playbooks for pitch quality, investor outreach, and startup distribution in India.
          </p>
        </header>

        <section className="blog-list" aria-label="Blog posts">
          {posts.length ? (
            posts.map((post) => (
              <article key={post.slug} className="blog-card">
                <p className="blog-card-meta">
                  <span>{post.publishedAt}</span>
                  <span>·</span>
                  <span>{post.author}</span>
                </p>
                <h2>
                  <Link href={`/blog/${post.slug}`}>{post.title}</Link>
                </h2>
                <p>{post.excerpt}</p>
                {post.tags.length ? (
                  <div className="blog-tags" aria-label="Tags">
                    {post.tags.map((tag) => (
                      <span key={`${post.slug}-${tag}`}>{tag}</span>
                    ))}
                  </div>
                ) : null}
              </article>
            ))
          ) : (
            <article className="blog-card">
              <h2>New articles coming soon</h2>
              <p>
                We are preparing audience-first startup stories and insights. Please check back soon.
              </p>
            </article>
          )}
        </section>

        <LeadCaptureForm
          source="blog_index"
          title="Get fresh founder and investor playbooks"
          description="Weekly StartupManch insights straight to your inbox."
        />
      </main>
      <SiteFooter />
    </AdRailsScaffold>
  );
}
