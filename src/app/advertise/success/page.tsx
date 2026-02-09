import AdOnboardingClient from "@/components/AdOnboardingClient";

type SearchParams = Record<string, string | string[] | undefined>;

type AdvertiseSuccessPageProps = {
  searchParams?: Promise<SearchParams> | SearchParams;
};

function firstValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }
  return value ?? "";
}

export default async function AdvertiseSuccessPage({ searchParams }: AdvertiseSuccessPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const sessionId = firstValue(resolvedSearchParams.session_id).trim();

  return <AdOnboardingClient sessionId={sessionId} />;
}
