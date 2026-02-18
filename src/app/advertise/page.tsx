import type { Metadata } from "next";
import { Suspense } from "react";
import AdvertiseCheckoutClient from "@/components/AdvertiseCheckoutClient";
import { toAbsoluteSiteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "Advertise on StartupManch | Sponsor Startup Visibility",
  description:
    "Promote your startup with sponsor placements across StartupManch rails.",
  alternates: {
    canonical: "/advertise",
  },
  openGraph: {
    title: "Advertise on StartupManch",
    description:
      "Promote your startup with sponsor placements across StartupManch rails.",
    url: toAbsoluteSiteUrl("/advertise"),
  },
  twitter: {
    card: "summary",
    title: "Advertise on StartupManch",
    description:
      "Promote your startup with sponsor placements across StartupManch rails.",
  },
};

export default function AdvertisePage() {
  return (
    <Suspense fallback={null}>
      <AdvertiseCheckoutClient />
    </Suspense>
  );
}
