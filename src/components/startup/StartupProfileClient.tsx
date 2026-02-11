"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import SiteFooter from "@/components/SiteFooter";
import TopNav from "@/components/TopNav";
import RevenueTrendCard from "@/components/startup/RevenueTrendCard";
import SaleBanner from "@/components/startup/SaleBanner";
import SponsorStrip from "@/components/startup/SponsorStrip";
import StartupContactModal from "@/components/startup/StartupContactModal";
import StartupMetricsRow from "@/components/startup/StartupMetricsRow";
import { formatDualAmount, formatRelativeDate, type StartupProfilePayload } from "@/lib/startups/profile";
import { hasBrowserSupabaseEnv, supabaseBrowser } from "@/lib/supabase/client";

type StartupProfileClientProps = {
  startupId: string;
};

const socialOrder = [
  { key: "website", label: "Website" },
  { key: "linkedin", label: "LinkedIn" },
  { key: "twitter", label: "X / Twitter" },
  { key: "instagram", label: "Instagram" },
] as const;

const toAbsoluteUrl = (value: string | null | undefined) => {
  const raw = (value ?? "").trim();
  if (!raw) return null;
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  return `https://${raw}`;
};

export default function StartupProfileClient({ startupId }: StartupProfileClientProps) {
  const [profile, setProfile] = useState<StartupProfilePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [watchersCount, setWatchersCount] = useState(0);
  const [isWatching, setIsWatching] = useState(false);
  const [watchBusy, setWatchBusy] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [shareFeedback, setShareFeedback] = useState<string | null>(null);

  const getAuthToken = useCallback(async () => {
    if (!hasBrowserSupabaseEnv) return null;
    const { data } = await supabaseBrowser.auth.getSession();
    return data.session?.access_token ?? null;
  }, []);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const token = await getAuthToken();
      const response = await fetch(`/api/startups/${startupId}/profile`, {
        cache: "no-store",
        headers: token
          ? {
              Authorization: `Bearer ${token}`,
            }
          : undefined,
      });

      const payload = (await response.json()) as StartupProfilePayload | { error?: string };
      if (!response.ok) {
        throw new Error((payload as { error?: string }).error ?? "Unable to load startup profile.");
      }

      const typedPayload = payload as StartupProfilePayload;
      setProfile(typedPayload);
      setWatchersCount(typedPayload.watchers.count);
      setIsWatching(typedPayload.watchers.is_watching);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load startup profile.");
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, [getAuthToken, startupId]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const toggleWatch = async () => {
    if (!profile || watchBusy) return;
    setWatchBusy(true);

    try {
      const token = await getAuthToken();
      const response = await fetch(`/api/startups/${startupId}/watch`, {
        method: isWatching ? "DELETE" : "POST",
        headers: token
          ? {
              Authorization: `Bearer ${token}`,
            }
          : undefined,
      });

      const payload = (await response.json()) as {
        error?: string;
        watchers_count?: number;
        is_watching?: boolean;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to update watch status.");
      }

      setWatchersCount(payload.watchers_count ?? watchersCount);
      setIsWatching(Boolean(payload.is_watching));
    } catch (watchError) {
      setError(watchError instanceof Error ? watchError.message : "Unable to update watch status.");
    } finally {
      setWatchBusy(false);
    }
  };

  const handleShare = async () => {
    const shareUrl = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({
          title: profile?.startup.name,
          url: shareUrl,
        });
        setShareFeedback("Shared");
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
        setShareFeedback("Link copied");
      } else {
        setShareFeedback("Share unavailable");
      }
    } catch {
      setShareFeedback("Share cancelled");
    } finally {
      setTimeout(() => setShareFeedback(null), 1800);
    }
  };

  const socialEntries = useMemo(() => {
    if (!profile?.startup.social_links) return [] as Array<{ key: string; label: string; url: string }>;

    return socialOrder
      .map(({ key, label }) => {
        const rawValue = profile.startup.social_links?.[key] ?? null;
        const url = toAbsoluteUrl(rawValue);
        if (!url) return null;
        return { key, label, url };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
  }, [profile]);

  if (loading) {
    return (
      <main className="page startup-profile-page">
        <div className="startup-profile-shell">
          <TopNav context="inner" showPostPitch={false} />
          <section className="startup-profile-loading">Loading startup profile...</section>
        </div>
      </main>
    );
  }

  if (error || !profile) {
    return (
      <main className="page startup-profile-page">
        <div className="startup-profile-shell">
          <TopNav context="inner" showPostPitch={false} />
          <section className="startup-profile-error">
            <h2>Unable to load startup profile</h2>
            <p>{error ?? "Please try again."}</p>
            <button type="button" onClick={() => void loadProfile()}>
              Retry
            </button>
          </section>
        </div>
      </main>
    );
  }

  const websiteUrl = toAbsoluteUrl(profile.startup.website);
  const founderName = profile.founder.display_name || "Founder";
  const founderInitial = founderName.slice(0, 1).toUpperCase();
  const isPublicStartup = profile.startup.status === "approved";
  const revenueSeries = profile.revenue.series.map((point) => ({
    date: point.date,
    amount: point.amount,
  }));

  return (
    <main className="page startup-profile-page">
      <div className="startup-profile-shell">
        <TopNav context="inner" showPostPitch={false} />

        <SponsorStrip title="Trusted sponsors" />

        <header className="startup-profile-hero">
          <div className="startup-profile-titleblock">
            <p className="metric-label">Startup profile</p>
            <h1>{profile.startup.name}</h1>
            <p className="startup-profile-tagline">{profile.startup.one_liner ?? "No one-liner provided."}</p>
            <p className="startup-profile-meta">
              {profile.startup.category ?? "Category not set"}
              <span>·</span>
              {profile.startup.city ?? profile.founder.city ?? "City not set"}
              <span>·</span>
              {profile.startup.country_code ?? "Country n/a"}
            </p>
          </div>

          <div className="startup-profile-actions">
            <button
              type="button"
              className="trust-action primary"
              onClick={toggleWatch}
              disabled={watchBusy || !isPublicStartup}
            >
              {watchBusy ? "Saving..." : isWatching ? "Unwatch" : "Watch startup"}
            </button>
            <button
              type="button"
              className="trust-action ghost"
              onClick={() => setContactOpen(true)}
              disabled={!isPublicStartup}
            >
              Contact founder
            </button>
            <button type="button" className="trust-action ghost" onClick={handleShare}>
              Share
            </button>
            {websiteUrl ? (
              <a href={websiteUrl} target="_blank" rel="noreferrer" className="trust-action secondary">
                Visit site
              </a>
            ) : null}
            {shareFeedback ? <span className="trust-action-feedback">{shareFeedback}</span> : null}
            {!isPublicStartup ? (
              <span className="metric-note">Private preview mode (startup not approved yet)</span>
            ) : null}
          </div>
        </header>

        <SaleBanner
          isForSale={profile.startup.is_for_sale}
          askingPriceDual={profile.startup.asking_price_dual}
        />

        <StartupMetricsRow
          rank={profile.rank.all_time}
          rankTotal={profile.rank.total}
          watchersCount={watchersCount}
          allTimeRevenueDual={profile.revenue.all_time_revenue_dual}
          mrrDual={profile.revenue.mrr_dual}
          activeSubscriptions={profile.revenue.active_subscriptions}
          revenueSource={profile.revenue.source}
        />

        <RevenueTrendCard
          series={revenueSeries}
          currency={profile.revenue.base_currency}
          provider={profile.revenue.provider}
          status={profile.revenue.status}
          lastUpdated={profile.revenue.last_updated}
          fxRateLabel={`1 USD = ${profile.fx.usdToInr.toFixed(2)} INR`}
        />

        <section className="startup-founder-section">
          <div className="startup-founder-card">
            <div className="startup-founder-avatar">
              {profile.startup.founder_photo_url ? (
                <div
                  className="startup-founder-avatar-image"
                  style={{ backgroundImage: `url(${profile.startup.founder_photo_url})` }}
                />
              ) : (
                <span>{founderInitial}</span>
              )}
            </div>

            <div>
              <p className="metric-label">Founder</p>
              <h3>{founderName}</h3>
              <p>{profile.founder.city ?? "City not shared"}</p>
              <p className="metric-note">
                Founded: {profile.startup.founded_on ?? "n/a"} · D2C: {profile.startup.is_d2c ? "Yes" : "No"}
              </p>
            </div>
          </div>

          <article className="startup-founder-story">
            <p className="metric-label">Founder story</p>
            <p>{profile.startup.founder_story ?? "Founder story not added yet."}</p>
          </article>
        </section>

        {profile.latest_pitch ? (
          <section className="startup-video-section">
            <div className="startup-video-head">
              <h3>Latest approved pitch</h3>
              <p className="metric-note">Approved: {formatRelativeDate(profile.latest_pitch.approved_at)}</p>
            </div>
            {profile.latest_pitch.video_url ? (
              <video
                className="startup-profile-video"
                src={profile.latest_pitch.video_url}
                poster={profile.latest_pitch.poster_url ?? undefined}
                controls
                playsInline
                preload="metadata"
              />
            ) : (
              <div
                className="startup-profile-video startup-profile-video-fallback"
                style={{
                  backgroundImage: profile.latest_pitch.poster_url
                    ? `url(${profile.latest_pitch.poster_url})`
                    : undefined,
                }}
              >
                <span>Pitch video unavailable</span>
              </div>
            )}
            <div className="startup-video-meta">
              <span>Ask: {profile.latest_pitch.ask ?? "-"}</span>
              <span>Equity: {profile.latest_pitch.equity ?? "-"}</span>
              <span>Valuation: {profile.latest_pitch.valuation ?? "-"}</span>
            </div>
          </section>
        ) : null}

        <section className="startup-extra-grid">
          <article className="startup-social-section">
            <h3>Links</h3>
            <div className="startup-social-list">
              {socialEntries.length ? (
                socialEntries.map((entry) => (
                  <a key={entry.key} href={entry.url} target="_blank" rel="noreferrer">
                    {entry.label}
                  </a>
                ))
              ) : (
                <p>No links published.</p>
              )}
            </div>
          </article>

          <article className="startup-info-section">
            <h3>Profile signals</h3>
            <p>
              Currency display: {formatDualAmount(profile.revenue.all_time_revenue_dual)}
            </p>
            <p>
              FX source: {profile.fx.isFallback ? "Fallback" : "Live"} ({formatRelativeDate(profile.fx.fetchedAt)})
            </p>
            <p>
              Last sync: {formatRelativeDate(profile.revenue.last_updated)}
            </p>
            <p>
              Self-reported monthly tag: {profile.startup.monthly_revenue ?? "-"}
            </p>
            <p>
              Public profile status: {profile.startup.status}
            </p>
          </article>
        </section>

        <div className="startup-profile-footer-actions">
          <Link href={`/startup/me/edit`} className="trust-action ghost">
            Edit founder profile
          </Link>
          <button
            type="button"
            className="trust-action ghost"
            onClick={() => setContactOpen(true)}
            disabled={!isPublicStartup}
          >
            Reach founder
          </button>
        </div>

        <SponsorStrip title="More sponsor tools" />
        <SiteFooter />
      </div>

      <StartupContactModal
        open={contactOpen}
        startupId={profile.startup.id}
        startupName={profile.startup.name}
        onClose={() => setContactOpen(false)}
      />
    </main>
  );
}
