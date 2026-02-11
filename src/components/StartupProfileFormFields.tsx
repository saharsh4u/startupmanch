import type { ReactNode } from "react";
import type { StartupProfileFormValues } from "@/lib/startups/form";

export type StartupProfileFieldKey =
  | "startupName"
  | "startupCategory"
  | "startupCity"
  | "startupOneLiner"
  | "startupWebsite"
  | "startupFounderPhotoUrl"
  | "startupFounderStory"
  | "startupMonthlyRevenue"
  | "startupFoundedOn"
  | "startupCountryCode"
  | "startupCurrencyCode"
  | "startupAllTimeRevenue"
  | "startupMrr"
  | "startupActiveSubscriptions"
  | "startupAskingPrice";

type FieldA11yProps = {
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
};

type StartupProfileFormFieldsProps = {
  values: StartupProfileFormValues;
  onChange: (next: StartupProfileFormValues) => void;
  fieldIds?: Partial<Record<StartupProfileFieldKey, string>>;
  onBlurField?: (field: StartupProfileFieldKey) => void;
  clearFieldError?: (field: StartupProfileFieldKey) => void;
  getFieldA11yProps?: (field: StartupProfileFieldKey) => FieldA11yProps;
  renderFieldError?: (field: StartupProfileFieldKey) => ReactNode;
};

const fallbackFieldIds: Record<StartupProfileFieldKey, string> = {
  startupName: "startup-name",
  startupCategory: "startup-category",
  startupCity: "startup-city",
  startupOneLiner: "startup-one-liner",
  startupWebsite: "startup-website",
  startupFounderPhotoUrl: "startup-founder-photo-url",
  startupFounderStory: "startup-founder-story",
  startupMonthlyRevenue: "startup-monthly-revenue",
  startupFoundedOn: "startup-founded-on",
  startupCountryCode: "startup-country-code",
  startupCurrencyCode: "startup-currency-code",
  startupAllTimeRevenue: "startup-all-time-revenue",
  startupMrr: "startup-mrr",
  startupActiveSubscriptions: "startup-active-subscriptions",
  startupAskingPrice: "startup-asking-price",
};

const readA11y = (
  getFieldA11yProps: ((field: StartupProfileFieldKey) => FieldA11yProps) | undefined,
  field: StartupProfileFieldKey
) => getFieldA11yProps?.(field) ?? {};

export default function StartupProfileFormFields({
  values,
  onChange,
  fieldIds,
  onBlurField,
  clearFieldError,
  getFieldA11yProps,
  renderFieldError,
}: StartupProfileFormFieldsProps) {
  const ids = { ...fallbackFieldIds, ...(fieldIds ?? {}) };

  const update = <K extends keyof StartupProfileFormValues>(
    key: K,
    value: StartupProfileFormValues[K]
  ) => {
    onChange({ ...values, [key]: value });
  };

  const clearError = (field: StartupProfileFieldKey) => {
    clearFieldError?.(field);
  };

  return (
    <>
      <div className="form-field">
        <label htmlFor={ids.startupName}>Startup / company name</label>
        <input
          id={ids.startupName}
          type="text"
          required
          {...readA11y(getFieldA11yProps, "startupName")}
          placeholder="MasalaMile / MasalaMile Foods Pvt Ltd"
          value={values.name}
          onBlur={() => onBlurField?.("startupName")}
          onChange={(event) => {
            clearError("startupName");
            update("name", event.target.value);
          }}
        />
        {renderFieldError?.("startupName")}
      </div>

      <div className="form-field">
        <label htmlFor={ids.startupCategory}>Category</label>
        <input
          id={ids.startupCategory}
          type="text"
          required
          {...readA11y(getFieldA11yProps, "startupCategory")}
          placeholder="Food & Beverage"
          value={values.category}
          onBlur={() => onBlurField?.("startupCategory")}
          onChange={(event) => {
            clearError("startupCategory");
            update("category", event.target.value);
          }}
        />
        {renderFieldError?.("startupCategory")}
      </div>

      <div className="form-field">
        <label htmlFor={ids.startupCity}>City</label>
        <input
          id={ids.startupCity}
          type="text"
          required
          {...readA11y(getFieldA11yProps, "startupCity")}
          placeholder="Bengaluru"
          value={values.city}
          onBlur={() => onBlurField?.("startupCity")}
          onChange={(event) => {
            clearError("startupCity");
            update("city", event.target.value);
          }}
        />
        {renderFieldError?.("startupCity")}
      </div>

      <div className="form-field">
        <label htmlFor={ids.startupOneLiner}>One-liner</label>
        <input
          id={ids.startupOneLiner}
          type="text"
          required
          {...readA11y(getFieldA11yProps, "startupOneLiner")}
          placeholder="Cloud kitchen for office teams"
          value={values.one_liner}
          onBlur={() => onBlurField?.("startupOneLiner")}
          onChange={(event) => {
            clearError("startupOneLiner");
            update("one_liner", event.target.value);
          }}
        />
        {renderFieldError?.("startupOneLiner")}
      </div>

      <div className="form-field">
        <label htmlFor={ids.startupWebsite}>Website (optional)</label>
        <input
          id={ids.startupWebsite}
          type="url"
          {...readA11y(getFieldA11yProps, "startupWebsite")}
          placeholder="https://startup.com"
          value={values.website}
          onBlur={() => onBlurField?.("startupWebsite")}
          onChange={(event) => {
            clearError("startupWebsite");
            update("website", event.target.value);
          }}
        />
        {renderFieldError?.("startupWebsite")}
      </div>

      <div className="form-field">
        <label htmlFor={ids.startupFounderPhotoUrl}>Founder photo URL</label>
        <input
          id={ids.startupFounderPhotoUrl}
          type="url"
          {...readA11y(getFieldA11yProps, "startupFounderPhotoUrl")}
          placeholder="https://images.unsplash.com/..."
          value={values.founder_photo_url}
          onBlur={() => onBlurField?.("startupFounderPhotoUrl")}
          onChange={(event) => {
            clearError("startupFounderPhotoUrl");
            update("founder_photo_url", event.target.value);
          }}
        />
        {renderFieldError?.("startupFounderPhotoUrl")}
      </div>

      <div className="form-field">
        <label htmlFor={ids.startupFounderStory}>Founder story (optional)</label>
        <textarea
          id={ids.startupFounderStory}
          placeholder="What led you to build this startup?"
          value={values.founder_story}
          onBlur={() => onBlurField?.("startupFounderStory")}
          onChange={(event) => {
            clearError("startupFounderStory");
            update("founder_story", event.target.value);
          }}
        />
      </div>

      <div className="form-field">
        <label htmlFor={ids.startupMonthlyRevenue}>Monthly revenue (text)</label>
        <input
          id={ids.startupMonthlyRevenue}
          type="text"
          placeholder="$25k MRR"
          value={values.monthly_revenue}
          onBlur={() => onBlurField?.("startupMonthlyRevenue")}
          onChange={(event) => update("monthly_revenue", event.target.value)}
        />
      </div>

      <div className="form-field">
        <label htmlFor={ids.startupFoundedOn}>Founded on (optional)</label>
        <input
          id={ids.startupFoundedOn}
          type="date"
          value={values.founded_on}
          onBlur={() => onBlurField?.("startupFoundedOn")}
          onChange={(event) => update("founded_on", event.target.value)}
        />
      </div>

      <div className="form-field">
        <label htmlFor={ids.startupCountryCode}>Country code (optional)</label>
        <input
          id={ids.startupCountryCode}
          type="text"
          maxLength={3}
          placeholder="IN"
          value={values.country_code}
          onBlur={() => onBlurField?.("startupCountryCode")}
          onChange={(event) => update("country_code", event.target.value.toUpperCase())}
        />
      </div>

      <div className="form-field">
        <label htmlFor={ids.startupCurrencyCode}>Primary currency</label>
        <select
          id={ids.startupCurrencyCode}
          value={values.currency_code}
          onBlur={() => onBlurField?.("startupCurrencyCode")}
          onChange={(event) => update("currency_code", event.target.value === "USD" ? "USD" : "INR")}
        >
          <option value="INR">INR</option>
          <option value="USD">USD</option>
        </select>
      </div>

      <div className="form-field">
        <label htmlFor={ids.startupAllTimeRevenue}>Self-reported all-time revenue</label>
        <input
          id={ids.startupAllTimeRevenue}
          type="number"
          min={0}
          step="0.01"
          placeholder="500000"
          value={values.self_reported_all_time_revenue}
          onBlur={() => onBlurField?.("startupAllTimeRevenue")}
          onChange={(event) => update("self_reported_all_time_revenue", event.target.value)}
        />
      </div>

      <div className="form-field">
        <label htmlFor={ids.startupMrr}>Self-reported MRR</label>
        <input
          id={ids.startupMrr}
          type="number"
          min={0}
          step="0.01"
          placeholder="25000"
          value={values.self_reported_mrr}
          onBlur={() => onBlurField?.("startupMrr")}
          onChange={(event) => update("self_reported_mrr", event.target.value)}
        />
      </div>

      <div className="form-field">
        <label htmlFor={ids.startupActiveSubscriptions}>Self-reported active subscriptions</label>
        <input
          id={ids.startupActiveSubscriptions}
          type="number"
          min={0}
          step={1}
          placeholder="120"
          value={values.self_reported_active_subscriptions}
          onBlur={() => onBlurField?.("startupActiveSubscriptions")}
          onChange={(event) => update("self_reported_active_subscriptions", event.target.value)}
        />
      </div>

      <div className="form-field">
        <label htmlFor="startup-social-linkedin">LinkedIn URL (optional)</label>
        <input
          id="startup-social-linkedin"
          type="url"
          placeholder="https://linkedin.com/company/..."
          value={values.social_linkedin}
          onChange={(event) => update("social_linkedin", event.target.value)}
        />
      </div>

      <div className="form-field">
        <label htmlFor="startup-social-twitter">X / Twitter URL (optional)</label>
        <input
          id="startup-social-twitter"
          type="url"
          placeholder="https://x.com/..."
          value={values.social_twitter}
          onChange={(event) => update("social_twitter", event.target.value)}
        />
      </div>

      <div className="form-field">
        <label htmlFor="startup-social-instagram">Instagram URL (optional)</label>
        <input
          id="startup-social-instagram"
          type="url"
          placeholder="https://instagram.com/..."
          value={values.social_instagram}
          onChange={(event) => update("social_instagram", event.target.value)}
        />
      </div>

      <label className="form-checkbox startup-inline-checkbox">
        <input
          type="checkbox"
          checked={values.is_d2c}
          onChange={(event) => update("is_d2c", event.target.checked)}
        />
        <span>Direct to consumer (D2C)</span>
      </label>

      <label className="form-checkbox startup-inline-checkbox">
        <input
          type="checkbox"
          checked={values.is_for_sale}
          onChange={(event) => update("is_for_sale", event.target.checked)}
        />
        <span>Startup is currently for sale</span>
      </label>

      {values.is_for_sale ? (
        <div className="form-field">
          <label htmlFor={ids.startupAskingPrice}>Asking price</label>
          <input
            id={ids.startupAskingPrice}
            type="number"
            min={0}
            step="0.01"
            required
            {...readA11y(getFieldA11yProps, "startupAskingPrice")}
            placeholder="1200000"
            value={values.asking_price}
            onBlur={() => onBlurField?.("startupAskingPrice")}
            onChange={(event) => {
              clearError("startupAskingPrice");
              update("asking_price", event.target.value);
            }}
          />
          {renderFieldError?.("startupAskingPrice")}
        </div>
      ) : null}
    </>
  );
}
