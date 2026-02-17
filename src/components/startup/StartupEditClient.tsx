"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import AdRailsScaffold from "@/components/AdRailsScaffold";
import SiteFooter from "@/components/SiteFooter";
import StartupProfileFormFields, { type StartupProfileFieldKey } from "@/components/StartupProfileFormFields";
import TopNav from "@/components/TopNav";
import { POST_PITCH_FALLBACK_HREF } from "@/lib/post-pitch";
import {
  fromStartupRecordToFormValues,
  type StartupProfileFormValues,
  toStartupApiPayload,
} from "@/lib/startups/form";
import { hasBrowserSupabaseEnv, supabaseBrowser } from "@/lib/supabase/client";

type StartupMineRow = {
  id: string;
  name: string;
  status: "pending" | "approved" | "rejected";
  latest_approved_pitch_id: string | null;
  [key: string]: unknown;
};

type FieldErrorMap = Partial<Record<StartupProfileFieldKey, string>>;

const isValidHttpUrl = (value: string) => {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};

export default function StartupEditClient() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [startups, setStartups] = useState<StartupMineRow[]>([]);
  const [selectedStartupId, setSelectedStartupId] = useState<string | null>(null);
  const [formValues, setFormValues] = useState<StartupProfileFormValues>(
    fromStartupRecordToFormValues(null)
  );
  const [fieldErrors, setFieldErrors] = useState<FieldErrorMap>({});
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const boot = async () => {
      setLoading(true);
      setError(null);

      try {
        if (!hasBrowserSupabaseEnv) {
          throw new Error("Supabase auth is not configured in this environment.");
        }

        const { data } = await supabaseBrowser.auth.getSession();
        const accessToken = data.session?.access_token ?? null;
        if (!accessToken) {
          throw new Error("Sign in first to edit your startup profile.");
        }

        if (!active) return;
        setToken(accessToken);

        const response = await fetch("/api/startups/mine", {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          cache: "no-store",
        });

        const payload = (await response.json()) as {
          startups?: StartupMineRow[];
          error?: string;
        };

        if (!response.ok) {
          throw new Error(payload.error ?? "Unable to load your startups.");
        }

        const rows = payload.startups ?? [];
        if (!active) return;

        setStartups(rows);
        const firstStartup = rows[0] ?? null;
        setSelectedStartupId(firstStartup?.id ?? null);
        setFormValues(fromStartupRecordToFormValues(firstStartup));
      } catch (bootError) {
        if (!active) return;
        setError(bootError instanceof Error ? bootError.message : "Unable to load startup profile.");
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void boot();
    return () => {
      active = false;
    };
  }, []);

  const selectedStartup = useMemo(
    () => startups.find((startup) => startup.id === selectedStartupId) ?? null,
    [selectedStartupId, startups]
  );

  const clearFieldError = (field: StartupProfileFieldKey) => {
    setFieldErrors((previous) => {
      if (!previous[field]) return previous;
      const next = { ...previous };
      delete next[field];
      return next;
    });
  };

  const getFieldA11yProps = (field: StartupProfileFieldKey) => ({
    "aria-invalid": Boolean(fieldErrors[field]),
    "aria-describedby": fieldErrors[field] ? `${field}-error` : undefined,
  });

  const renderFieldError = (field: StartupProfileFieldKey) => {
    const message = fieldErrors[field];
    if (!message) return null;
    return (
      <p id={`${field}-error`} className="form-error" role="alert">
        {message}
      </p>
    );
  };

  const validate = () => {
    const nextErrors: FieldErrorMap = {};

    if (!formValues.name.trim()) nextErrors.startupName = "Startup name is required.";
    if (!formValues.category.trim()) nextErrors.startupCategory = "Category is required.";
    if (!formValues.city.trim()) nextErrors.startupCity = "City is required.";
    if (!formValues.one_liner.trim()) nextErrors.startupOneLiner = "One-liner is required.";

    const website = formValues.website.trim();
    if (website && !isValidHttpUrl(website)) {
      nextErrors.startupWebsite = "Website must be a valid http/https URL.";
    }

    const founderPhoto = formValues.founder_photo_url.trim();
    if (founderPhoto && !isValidHttpUrl(founderPhoto)) {
      nextErrors.startupFounderPhotoUrl = "Founder photo URL must be valid http/https URL.";
    }

    if (formValues.is_for_sale) {
      const askingPrice = Number(formValues.asking_price);
      if (!formValues.asking_price.trim()) {
        nextErrors.startupAskingPrice = "Asking price is required when startup is for sale.";
      } else if (!Number.isFinite(askingPrice) || askingPrice < 0) {
        nextErrors.startupAskingPrice = "Asking price must be a valid number >= 0.";
      }
    }

    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSave = async () => {
    if (!selectedStartupId || !token) return;
    setSaveMessage(null);

    if (!validate()) {
      setSaveMessage("Fix the highlighted fields and try again.");
      return;
    }

    setSaveBusy(true);
    try {
      const response = await fetch(`/api/startups/${selectedStartupId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(toStartupApiPayload(formValues)),
      });

      const payload = (await response.json()) as {
        startup?: StartupMineRow;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to save startup profile.");
      }

      if (payload.startup) {
        setStartups((previous) =>
          previous.map((startup) =>
            startup.id === payload.startup?.id
              ? {
                  ...startup,
                  ...payload.startup,
                }
              : startup
          )
        );
      }

      setSaveMessage("Profile saved.");
    } catch (saveError) {
      setSaveMessage(saveError instanceof Error ? saveError.message : "Unable to save profile.");
    } finally {
      setSaveBusy(false);
    }
  };

  const handleSelectStartup = (id: string) => {
    setSelectedStartupId(id);
    const selected = startups.find((startup) => startup.id === id) ?? null;
    setFormValues(fromStartupRecordToFormValues(selected));
    setFieldErrors({});
    setSaveMessage(null);
  };

  if (loading) {
    return (
      <AdRailsScaffold>
        <div className="startup-edit-shell">
          <TopNav context="inner" showPostPitch={false} />
          <section className="startup-profile-loading">Loading founder edit panel...</section>
        </div>
      </AdRailsScaffold>
    );
  }

  return (
    <AdRailsScaffold>
      <div className="startup-edit-shell">
        <TopNav context="inner" showPostPitch={false} />

        <header className="startup-edit-hero">
          <h1>Founder startup profile edit</h1>
          <p>
            Update the fields used by the public profile route: <code>/startup/[id]</code>.
          </p>
        </header>

        {error ? (
          <section className="startup-profile-error">
            <h2>Cannot load your startup profiles</h2>
            <p>{error}</p>
            <Link href={POST_PITCH_FALLBACK_HREF} className="trust-action ghost">
              Open post pitch form
            </Link>
          </section>
        ) : null}

        {!error && startups.length === 0 ? (
          <section className="startup-profile-error">
            <h2>No startup found for this account</h2>
            <p>Create your first startup by posting a pitch.</p>
            <Link href={POST_PITCH_FALLBACK_HREF} className="trust-action primary">
              Post a pitch
            </Link>
          </section>
        ) : null}

        {!error && startups.length > 0 ? (
          <section className="submit-card">
            <div className="submit-card-header">
              <h2>Edit startup profile</h2>
              <span>Saved fields are visible on public startup profile pages.</span>
            </div>

            {startups.length > 1 ? (
              <div className="form-field">
                <label htmlFor="startup-edit-selector">Select startup</label>
                <select
                  id="startup-edit-selector"
                  value={selectedStartupId ?? ""}
                  onChange={(event) => handleSelectStartup(event.target.value)}
                >
                  {startups.map((startup) => (
                    <option key={startup.id} value={startup.id}>
                      {startup.name} ({startup.status})
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            <div className="submit-grid">
              <StartupProfileFormFields
                values={formValues}
                onChange={setFormValues}
                clearFieldError={clearFieldError}
                getFieldA11yProps={getFieldA11yProps}
                renderFieldError={renderFieldError}
              />
            </div>

            <div className="submit-actions">
              <button type="button" onClick={handleSave} disabled={saveBusy || !selectedStartupId}>
                {saveBusy ? "Saving..." : "Save profile"}
              </button>
              {selectedStartup ? (
                <Link href={`/startup/${selectedStartup.id}`} className="trust-action ghost">
                  View public profile
                </Link>
              ) : null}
              {saveMessage ? <p className="submit-note">{saveMessage}</p> : null}
            </div>
          </section>
        ) : null}

        <SiteFooter />
      </div>
    </AdRailsScaffold>
  );
}
