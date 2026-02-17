import { Suspense } from "react";
import AdvertiseCheckoutClient from "@/components/AdvertiseCheckoutClient";

export default function AdvertisePage() {
  return (
    <Suspense fallback={null}>
      <AdvertiseCheckoutClient />
    </Suspense>
  );
}
