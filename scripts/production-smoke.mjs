import { chromium } from "playwright";

const BASE_URL = process.env.SMOKE_BASE_URL || process.argv[2] || "https://startupmanch.com";

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
  const detailResponses = [];

  page.on("response", async (response) => {
    const url = response.url();
    if (!url.includes("/api/pitches")) return;

    const bodyLength = async () => {
      try {
        const payload = await response.json();
        return Array.isArray(payload?.data) ? payload.data.length : null;
      } catch {
        return null;
      }
    };

    if (url.includes("/detail")) {
      detailResponses.push({
        status: response.status(),
        url,
      });
      return;
    }

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
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.getByText("Today's top 4").waitFor({ timeout: 20_000 });
    await page.locator(".pitch-top-grid .pitch-show-card").first().waitFor({ timeout: 20_000 });
    pushCheck("homepage-load", true, "Homepage and hot section rendered.");

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

    const cardsBefore = await page.locator(".pitch-show-card").count();
    await page.evaluate(() => {
      const sentinel = document.querySelector(".pitch-feed-sentinel");
      if (sentinel) {
        sentinel.scrollIntoView({ block: "center" });
      } else {
        window.scrollTo(0, document.body.scrollHeight);
      }
    });

    await waitFor(
      async () => {
        const nextPageSeen = feedResponses.some((res) => res.mode === "feed" && res.offset >= 20);
        const status = (await page.locator(".pitch-feed-status").textContent()) || "";
        return nextPageSeen || status.includes("No more pitches");
      },
      15_000
    );

    const cardsAfter = await page.locator(".pitch-show-card").count();
    const nextFeed = feedResponses.find((res) => res.mode === "feed" && res.offset >= 20);
    const statusText = ((await page.locator(".pitch-feed-status").textContent()) || "").trim();

    const dataExhausted = Boolean(
      initialFeed &&
        initialFeed.ok &&
        typeof initialFeed.dataLength === "number" &&
        initialFeed.dataLength < 20 &&
        statusText.includes("No more pitches")
    );
    const paged = Boolean(
      nextFeed &&
        nextFeed.ok &&
        typeof nextFeed.dataLength === "number" &&
        nextFeed.dataLength > 0 &&
        cardsAfter > cardsBefore
    );
    pushCheck(
      "infinite-scroll",
      paged || dataExhausted,
      paged
        ? `Next page loaded at offset=${nextFeed.offset}, cards ${cardsBefore}->${cardsAfter}.`
        : dataExhausted
          ? `Initial dataset exhausted at ${initialFeed.dataLength}; end-of-list visible.`
          : `No confirmed growth. cards ${cardsBefore}->${cardsAfter}, status="${statusText}".`
    );

    await page.locator(".pitch-top-grid .pitch-show-card").first().click({ timeout: 15_000 });
    await page.locator(".expand-shell").waitFor({ state: "visible", timeout: 15_000 });
    pushCheck("overlay-open", true, "Expanded overlay opened from first hot pitch.");

    const videoVisible = await page
      .locator(".expand-video video.expand-media")
      .first()
      .isVisible()
      .catch(() => false);
    const fallbackVisible = await page
      .locator(".expand-media-fallback-label")
      .first()
      .isVisible()
      .catch(() => false);
    pushCheck(
      "overlay-media",
      videoVisible || fallbackVisible,
      videoVisible ? "Video visible." : fallbackVisible ? "Fallback media visible." : "No media node visible."
    );

    await page.waitForTimeout(1_500);
    const detailsUnavailableVisible = await page
      .locator(".trust-note.error")
      .first()
      .isVisible()
      .catch(() => false);
    const detail404 = detailResponses.some((res) => res.status === 404);
    pushCheck(
      "overlay-detail-state",
      !detailsUnavailableVisible && !detail404,
      detail404
        ? `Detail endpoint returned 404 (${detailResponses.map((res) => res.url).join(", ")}).`
        : detailsUnavailableVisible
          ? 'Overlay displayed "Details unavailable."'
          : "No detail error state visible."
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
      detailResponses,
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
