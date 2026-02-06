import fs from "fs";
import path from "path";

export type SeedCompany = {
  name: string;
  sector: string;
  revenue: string | null;
  aliases: string[];
  sourceRefs: string[];
};

const parseCsvLine = (line: string): string[] => {
  const parts: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === "," && !inQuotes) {
      parts.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  parts.push(current.trim());
  return parts;
};

export const getSeedCompanies = (): SeedCompany[] => {
  const csvPath = path.join(process.cwd(), "services", "ingestion", "companies_seed.csv");
  const raw = fs.readFileSync(csvPath, "utf-8").trim();
  const lines = raw.split(/\r?\n/);
  const header = parseCsvLine(lines[0]);
  const idx = {
    name: header.indexOf("name"),
    sector: header.indexOf("sector"),
    revenue: header.indexOf("revenue"),
    aliases: header.indexOf("aliases"),
    sourceRefs: header.indexOf("source_refs"),
  };
  return lines.slice(1).map((line) => {
    const cols = parseCsvLine(line);
    const aliases = (cols[idx.aliases] || "").split("|").filter(Boolean);
    const sourceRefs = (cols[idx.sourceRefs] || "").split("|").filter(Boolean);
    return {
      name: cols[idx.name],
      sector: cols[idx.sector],
      revenue: cols[idx.revenue] || null,
      aliases,
      sourceRefs,
    };
  });
};
