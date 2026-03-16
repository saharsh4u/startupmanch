import { chromium } from "playwright";

const BASE_URL = process.env.SMOKE_BASE_URL || process.argv[2] || "https://startupmanch.com";
const MARKETPLACE_URL = new URL("/roundtable", BASE_URL).toString();

const parseFeedMeta = (rawUrl) => {
  try {
    const url = new URL(rawUrl);
    return {
      mode: url.searchParams.get("mode"),
      offset: Number(url.searchParams.get("offset") || "0"),
      limit: Number(url.searchParams.get("limit") || "0"),
    };
  } catch {
    return { mode: null, offset: NaN, limit: NaN };
  }
};

const waitFor = async (predicate, timeoutMs = 15_000, pollMs = 200) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  return false;
};

const runScenario = async ({ name, viewport, isMobile = false }) => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport,
    isMobile,
    hasTouch: isMobile,
  });
  const page = await context.newPage();

  const feedResponses = [];
  const lobbyResponses = [];

  page.on("response", async (response) => {
    const url = response.url();
    if (url.includes("/api/roundtable/lobby")) {
      lobbyResponses.push({
        status: response.status(),
        ok: response.ok(),
        url,
      });
      return;
    }

    if (!url.includes("/api/pitches")) return;

    const bodyLength = async () => {
      try {
        const payload = await response.json();
        return Array.isArray(payload?.data) ? payload.data.length : null;
      } catch {
        return null;
      }
    };
    if (!url.includes("/api/pitches?")) {
      return;
    }

    const meta = parseFeedMeta(url);
    feedResponses.push({
      status: response.status(),
      ok: response.ok(),
      url,
      mode: meta.mode,
      offset: meta.offset,
      limit: meta.limit,
      dataLength: await bodyLength(),
    });
  });

  const checks = [];

  const pushCheck = (name, pass, details) => {
    checks.push({ name, pass, details });
  };

  try {
    await page.goto(MARKETPLACE_URL, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.locator(".stream-home-hero").waitFor({ timeout: 20_000 });
    await page.getByText("StartupManch TV").first().waitFor({ timeout: 20_000 });
    pushCheck("homepage-load", true, "Streaming homepage hero rendered.");

    const initialFeedReady = await waitFor(
      () => Promise.resolve(feedResponses.some((res) => res.mode === "feed" && res.offset === 0)),
      20_000
    );
    const initialFeed = feedResponses.find((res) => res.mode === "feed" && res.offset === 0);
    if (!initialFeedReady || !initialFeed) {
      pushCheck("initial-feed", false, "No initial feed response detected.");
    } else {
      pushCheck(
        "initial-feed",
        initialFeed.ok,
        `Initial feed status=${initialFeed.status}, length=${initialFeed.dataLength ?? "unknown"}.`
      );
    }

    await page.locator(".stream-home-roundtable .roundtable-seat-circle").waitFor({ timeout: 20_000 });
    pushCheck(
      "roundtable-preview",
      true,
      "Roundtable preview rendered."
    );

    const railReady = await waitFor(
      async () => (await page.locator(".stream-home-marquee .stream-home-rail-card").count()) > 0,
      20_000
    );
    const railCardCount = await page.locator(".stream-home-marquee .stream-home-rail-card").count();
    pushCheck(
      "video-rails",
      railReady,
      railReady ? `Looping rail rendered with ${railCardCount} cards.` : "Looping rail did not render."
    );

    const lobbyResponse = lobbyResponses.at(-1);
    pushCheck(
      "lobby-preview-fetch",
      !lobbyResponse || lobbyResponse.ok,
      lobbyResponse ? `Lobby status=${lobbyResponse.status}.` : "No lobby response observed; fallback preview may be in use."
    );
  } catch (error) {
    pushCheck("scenario-runtime", false, error instanceof Error ? error.message : String(error));
  } finally {
    await context.close();
    await browser.close();
  }

  return {
    name,
    checks,
    diagnostics: {
      feedResponses,
      lobbyResponses,
    },
  };
};

const main = async () => {
  const desktop = await runScenario({
    name: "desktop",
    viewport: { width: 1440, height: 900 },
    isMobile: false,
  });
  const mobile = await runScenario({
    name: "mobile",
    viewport: { width: 390, height: 844 },
    isMobile: true,
  });

  const report = {
    baseUrl: BASE_URL,
    timestampUtc: new Date().toISOString(),
    desktop,
    mobile,
  };

  console.log(JSON.stringify(report, null, 2));

  const failed = [desktop, mobile].some((scenario) => scenario.checks.some((check) => !check.pass));
  process.exit(failed ? 1 : 0);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
