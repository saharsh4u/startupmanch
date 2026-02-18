#!/usr/bin/env node
import fs from "fs";
import path from "path";

const [, , slugArg, ...titleParts] = process.argv;
const slug = (slugArg || "").trim().toLowerCase();
const title = titleParts.join(" ").trim();

if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
  console.error("Usage: node scripts/new-blog-post.mjs <slug> <Title Case Title>");
  process.exit(1);
}

if (!title) {
  console.error("Please provide a title after the slug.");
  process.exit(1);
}

const today = new Date().toISOString().slice(0, 10);
const filePath = path.join(process.cwd(), "src", "content", "blog", `${slug}.md`);

if (fs.existsSync(filePath)) {
  console.error(`Post already exists: ${filePath}`);
  process.exit(1);
}

const template = `---
slug: ${slug}
title: ${title}
excerpt: Add a short 1-line summary for search snippets.
publishedAt: ${today}
author: StartupManch Team
tags: founders,growth
---
## Why this matters
Add context for founders or investors.

## Practical playbook
- Step 1
- Step 2
- Step 3

## StartupManch CTA
Link to your lead capture flow and one related post.
`;

fs.writeFileSync(filePath, template, "utf8");
console.log(`Created ${filePath}`);
