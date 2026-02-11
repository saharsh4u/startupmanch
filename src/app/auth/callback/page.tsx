import { Suspense } from "react";
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
    <main className="submit-page">
      <Suspense fallback={<Fallback />}>
        <AuthCallbackClient />
      </Suspense>
    </main>
  );
}
