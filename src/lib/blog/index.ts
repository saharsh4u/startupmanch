import fs from "fs";
import path from "path";

export type BlogPostMeta = {
  slug: string;
  title: string;
  excerpt: string;
  publishedAt: string;
  author: string;
  tags: string[];
};

export type BlogPost = BlogPostMeta & {
  content: string;
};

export type BlogContentBlock =
  | { type: "h2"; text: string }
  | { type: "h3"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; items: string[] };

const BLOG_CONTENT_DIR = path.join(process.cwd(), "src", "content", "blog");

const normalizeDate = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed.length) return "1970-01-01";
  const parsed = Date.parse(trimmed);
  if (!Number.isFinite(parsed)) return "1970-01-01";
  return new Date(parsed).toISOString().slice(0, 10);
};

const parseFrontmatter = (raw: string) => {
  const trimmed = raw.trimStart();
  if (!trimmed.startsWith("---\n")) {
    return {
      frontmatter: {} as Record<string, string>,
      content: raw,
    };
  }

  const endIdx = trimmed.indexOf("\n---\n", 4);
  if (endIdx === -1) {
    return {
      frontmatter: {} as Record<string, string>,
      content: raw,
    };
  }

  const fmRaw = trimmed.slice(4, endIdx);
  const content = trimmed.slice(endIdx + 5);
  const frontmatter: Record<string, string> = {};

  for (const line of fmRaw.split("\n")) {
    const idx = line.indexOf(":");
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (!key.length || !value.length) continue;
    frontmatter[key] = value;
  }

  return { frontmatter, content };
};

const parseTags = (value: string | undefined) => {
  if (!value) return [] as string[];
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
};

const toMeta = (slug: string, frontmatter: Record<string, string>): BlogPostMeta => ({
  slug,
  title: frontmatter.title?.trim() || slug,
  excerpt: frontmatter.excerpt?.trim() || "",
  publishedAt: normalizeDate(frontmatter.publishedAt || ""),
  author: frontmatter.author?.trim() || "StartupManch Team",
  tags: parseTags(frontmatter.tags),
});

export const getAllPostSlugs = () => {
  if (!fs.existsSync(BLOG_CONTENT_DIR)) return [] as string[];
  return fs
    .readdirSync(BLOG_CONTENT_DIR)
    .filter((file) => file.endsWith(".md"))
    .map((file) => file.replace(/\.md$/, ""))
    .sort((left, right) => left.localeCompare(right));
};

export const getPostBySlug = (slug: string): BlogPost | null => {
  const safeSlug = slug.trim().toLowerCase();
  if (!safeSlug.length) return null;
  const filePath = path.join(BLOG_CONTENT_DIR, `${safeSlug}.md`);
  if (!fs.existsSync(filePath)) return null;

  const raw = fs.readFileSync(filePath, "utf8");
  const { frontmatter, content } = parseFrontmatter(raw);
  const meta = toMeta(safeSlug, frontmatter);

  return {
    ...meta,
    content: content.trim(),
  };
};

export const getAllPostsMeta = () =>
  getAllPostSlugs()
    .map((slug) => {
      const post = getPostBySlug(slug);
      if (!post) return null;
      const { content: _content, ...meta } = post;
      return meta;
    })
    .filter((post): post is BlogPostMeta => post !== null)
    .sort((left, right) => {
      const leftTime = Date.parse(left.publishedAt);
      const rightTime = Date.parse(right.publishedAt);
      return rightTime - leftTime;
    });

export const parseBlogContentBlocks = (content: string): BlogContentBlock[] => {
  const chunks = content
    .split(/\n\s*\n/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  return chunks.map((chunk) => {
    if (chunk.startsWith("## ")) {
      return { type: "h2", text: chunk.slice(3).trim() } as BlogContentBlock;
    }
    if (chunk.startsWith("### ")) {
      return { type: "h3", text: chunk.slice(4).trim() } as BlogContentBlock;
    }

    const listLines = chunk
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("- "));

    if (listLines.length > 0 && listLines.length === chunk.split("\n").length) {
      return {
        type: "list",
        items: listLines.map((line) => line.replace(/^- /, "").trim()).filter(Boolean),
      } as BlogContentBlock;
    }

    return {
      type: "paragraph",
      text: chunk.replace(/\s*\n\s*/g, " ").trim(),
    } as BlogContentBlock;
  });
};
