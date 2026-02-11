import { Suspense } from "react";
import AdRailsScaffold from "@/components/AdRailsScaffold";
import TopNav from "@/components/TopNav";
import AuthCallbackClient from "./AuthCallbackClient";

const Fallback = () => (
  <section className="submit-card">
    <div className="submit-card-header">
      <h2>Completing sign-in</h2>
      <span>Preparing authentication callback…</span>
    </div>
  </section>
);

export default function AuthCallbackPage() {
  return (
    <AdRailsScaffold>
      <div className="submit-shell">
        <TopNav context="inner" />
        <Suspense fallback={<Fallback />}>
          <AuthCallbackClient />
        </Suspense>
      </div>
    </AdRailsScaffold>
  );
}
