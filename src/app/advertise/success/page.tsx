import type { Metadata } from "next";
import AdOnboardingClient from "@/components/AdOnboardingClient";
import { toAbsoluteSiteUrl } from "@/lib/site";

type SearchParams = Record<string, string | string[] | undefined>;

type AdvertiseSuccessPageProps = {
  searchParams?: Promise<SearchParams> | SearchParams;
};

export const metadata: Metadata = {
  title: "Sponsor Onboarding | StartupManch",
  description: "Complete sponsor campaign details after checkout.",
  alternates: {
    canonical: "/advertise/success",
  },
  robots: {
    index: false,
    follow: false,
  },
  openGraph: {
    title: "Sponsor Onboarding | StartupManch",
    description: "Complete sponsor campaign details after checkout.",
    url: toAbsoluteSiteUrl("/advertise/success"),
  },
};

function firstValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }
  return value ?? "";
}

export default async function AdvertiseSuccessPage({ searchParams }: AdvertiseSuccessPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const sessionId = (
    firstValue(resolvedSearchParams.session_id) || firstValue(resolvedSearchParams.order_id)
  ).trim();
  const onboardingToken = firstValue(resolvedSearchParams.onboarding_token).trim();

  return <AdOnboardingClient sessionId={sessionId} onboardingToken={onboardingToken} />;
}
