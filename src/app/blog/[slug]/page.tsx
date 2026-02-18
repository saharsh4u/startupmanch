import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import AdRailsScaffold from "@/components/AdRailsScaffold";
import LeadCaptureForm from "@/components/LeadCaptureForm";
import SiteFooter from "@/components/SiteFooter";
import TopNav from "@/components/TopNav";
import {
  getAllPostSlugs,
  getPostBySlug,
  parseBlogContentBlocks,
} from "@/lib/blog";
import { toAbsoluteSiteUrl } from "@/lib/site";

type BlogPostPageProps = {
  params: {
    slug: string;
  };
};

export async function generateStaticParams() {
  return getAllPostSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: BlogPostPageProps): Promise<Metadata> {
  const post = getPostBySlug(params.slug);
  if (!post) {
    return {
      title: "Post not found | StartupManch Blog",
      robots: {
        index: false,
        follow: false,
      },
    };
  }

  return {
    title: `${post.title} | StartupManch Blog`,
    description: post.excerpt,
    alternates: {
      canonical: `/blog/${post.slug}`,
    },
    openGraph: {
      title: `${post.title} | StartupManch Blog`,
      description: post.excerpt,
      url: toAbsoluteSiteUrl(`/blog/${post.slug}`),
      type: "article",
      publishedTime: `${post.publishedAt}T00:00:00.000Z`,
      authors: [post.author],
      tags: post.tags,
    },
    twitter: {
      card: "summary_large_image",
      title: `${post.title} | StartupManch Blog`,
      description: post.excerpt,
    },
  };
}

export default function BlogPostPage({ params }: BlogPostPageProps) {
  const post = getPostBySlug(params.slug);
  if (!post) {
    notFound();
  }

  const blocks = parseBlogContentBlocks(post.content);
  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.excerpt,
    author: {
      "@type": "Organization",
      name: post.author,
    },
    publisher: {
      "@type": "Organization",
      name: "StartupManch",
      url: toAbsoluteSiteUrl("/"),
    },
    datePublished: `${post.publishedAt}T00:00:00.000Z`,
    dateModified: `${post.publishedAt}T00:00:00.000Z`,
    mainEntityOfPage: toAbsoluteSiteUrl(`/blog/${post.slug}`),
  };

  return (
    <AdRailsScaffold mainClassName="page page-home inner-rails-page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }}
      />
      <TopNav context="inner" />
      <main className="blog-shell">
        <article className="blog-post">
          <Link className="blog-back" href="/blog">
            ← Back to blog
          </Link>
          <header>
            <p className="blog-card-meta">
              <span>{post.publishedAt}</span>
              <span>·</span>
              <span>{post.author}</span>
            </p>
            <h1>{post.title}</h1>
            <p className="blog-excerpt">{post.excerpt}</p>
          </header>

          <section className="blog-content" aria-label="Article content">
            {blocks.map((block, index) => {
              if (block.type === "h2") {
                return <h2 key={`b-${index}`}>{block.text}</h2>;
              }
              if (block.type === "h3") {
                return <h3 key={`b-${index}`}>{block.text}</h3>;
              }
              if (block.type === "list") {
                return (
                  <ul key={`b-${index}`}>
                    {block.items.map((item, itemIndex) => (
                      <li key={`b-${index}-i-${itemIndex}`}>{item}</li>
                    ))}
                  </ul>
                );
              }
              return <p key={`b-${index}`}>{block.text}</p>;
            })}
          </section>
        </article>

        <LeadCaptureForm
          source={`blog_post_${post.slug}`}
          title="Get weekly startup growth insights"
          description="Subscribe for tactical founder and investor updates."
          compact
        />
      </main>
      <SiteFooter />
    </AdRailsScaffold>
  );
}
