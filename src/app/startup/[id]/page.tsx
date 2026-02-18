import type { Metadata } from "next";
import StartupProfileClient from "@/components/startup/StartupProfileClient";
import { toAbsoluteSiteUrl } from "@/lib/site";
import { hasServerSupabaseEnv, supabaseAdmin } from "@/lib/supabase/server";

type StartupRow = {
  id: string;
  name: string | null;
  one_liner: string | null;
  category: string | null;
};

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const startupId = params.id;
  const canonicalPath = `/startup/${startupId}`;

  let title = "Startup Profile | StartupManch";
  let description = "Explore startup profile details, traction, and founder information on StartupManch.";

  if (hasServerSupabaseEnv) {
    const { data } = await supabaseAdmin
      .from("startups")
      .select("id,name,one_liner,category,status")
      .eq("id", startupId)
      .eq("status", "approved")
      .maybeSingle();

    const startup = data as StartupRow | null;
    if (startup?.name) {
      title = `${startup.name} | StartupManch`;
      description =
        startup.one_liner?.trim() ||
        (startup.category ? `Startup profile in ${startup.category}.` : description);
    }
  }

  return {
    title,
    description,
    alternates: {
      canonical: canonicalPath,
    },
    openGraph: {
      title,
      description,
      url: toAbsoluteSiteUrl(canonicalPath),
      type: "article",
    },
    twitter: {
      card: "summary",
      title,
      description,
    },
  };
}

export default function StartupProfilePage({ params }: { params: { id: string } }) {
  return <StartupProfileClient startupId={params.id} />;
}
