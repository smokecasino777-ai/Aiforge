import asyncio
import re
from pathlib import Path

from playwright.async_api import async_playwright


BASE_URL = "https://fierce-forge-ios.preview.emergentagent.com"
ARTIFACT_DIR = Path("/app/test_reports/artifacts_iter23_ui")
ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)


def read_demo_credentials() -> tuple[str, str]:
    text = Path("/app/memory/test_credentials.md").read_text(encoding="utf-8")
    block = re.search(r"Customer demo account.*?Email\*\*: `([^`]+)`.*?Password\*\*: `([^`]+)`", text, re.S)
    if not block:
        raise RuntimeError("Missing demo credentials in /app/memory/test_credentials.md")
    return block.group(1), block.group(2)


async def close_tour_if_present(page):
    if await page.locator('[data-testid="tour-next"]').count():
        for _ in range(4):
            if not await page.locator('[data-testid="tour-next"]').is_visible():
                break
            await page.click('[data-testid="tour-next"]', force=True)
            await page.wait_for_timeout(120)


async def login_once(context, email: str, password: str, run_idx: int):
    page = await context.new_page()
    await page.set_viewport_size({"width": 390, "height": 844})
    await page.goto(BASE_URL, wait_until="domcontentloaded")
    await page.wait_for_timeout(1400)

    try:
        if await page.locator('[data-testid="skip-onboarding"]').count() and await page.locator('[data-testid="skip-onboarding"]').is_visible():
            await page.click('[data-testid="skip-onboarding"]', force=True)
            await page.wait_for_timeout(700)
            print(f"Run {run_idx}: onboarding skip tapped")
    except Exception as e:
        print(f"Run {run_idx}: onboarding skip not used ({e})")

    await page.wait_for_selector('[data-testid="login-email"]', timeout=20000)
    await page.fill('[data-testid="login-email"]', email)
    await page.fill('[data-testid="login-password"]', password)
    await page.click('[data-testid="login-submit"]', force=True)
    await page.wait_for_timeout(2200)

    # Home validation
    await page.wait_for_selector('[data-testid="tab-create"]', timeout=20000)
    await page.wait_for_selector('[data-testid="home-credit-balance"]', timeout=20000)
    await close_tour_if_present(page)
    await page.screenshot(path=str(ARTIFACT_DIR / f"run{run_idx}_home.jpeg"), quality=40, full_page=False)
    print(f"Run {run_idx}: login -> home successful")
    return page


async def main():
    email, password = read_demo_credentials()

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)

        # Fresh-session onboarding skip -> login -> Home, repeated 3x
        for i in range(1, 4):
            context = await browser.new_context()
            page = await login_once(context, email, password, i)
            await page.close()
            await context.close()

        # Deep flow checks in a dedicated session
        context = await browser.new_context()
        page = await login_once(context, email, password, 4)

        requests_seen = {"generate": 0, "avatar_generate": 0}

        def on_request(req):
            url = req.url
            if "/api/generate" in url and req.method == "POST":
                requests_seen["generate"] += 1
            if "/api/avatar/generate" in url and req.method == "POST":
                requests_seen["avatar_generate"] += 1

        page.on("request", on_request)

        # Create screen active + quote modal error/cancel
        await page.click('[data-testid="tab-create"]')
        await page.wait_for_selector('[data-testid="create-screen-active"]', timeout=12000)
        await close_tour_if_present(page)
        await page.click('[data-testid="create-screen-active"] [data-testid="type-image"]')
        await page.fill('[data-testid="create-screen-active"] [data-testid="prompt-input"]', 'Neon cyberpunk city skyline at dusk')
        before_generate_calls = requests_seen["generate"]
        await page.click('[data-testid="create-screen-active"] [data-testid="generate-btn"]')
        await page.wait_for_selector('[data-testid="credit-quote-modal"]', timeout=12000)
        await page.wait_for_selector('[data-testid="quote-error"]', timeout=12000)
        await page.click('[data-testid="quote-cancel"]')
        await page.locator('[data-testid="credit-quote-title"]').wait_for(state='hidden')
        after_generate_calls = requests_seen["generate"]
        print(f"Create quote cancel: generate calls before={before_generate_calls} after={after_generate_calls}")

        # Avatar screen quote modal error/cancel
        await page.click('[data-testid="tab-index"]', force=True)
        await page.wait_for_selector('[data-testid="home-avatar-tile"]', timeout=12000)
        await page.click('[data-testid="home-avatar-tile"]', force=True)
        await page.wait_for_selector('[data-testid="avatar-prompt"]', timeout=12000)
        await page.fill('[data-testid="avatar-prompt"]', 'confident neon hacker portrait')
        before_avatar_calls = requests_seen["avatar_generate"]
        await close_tour_if_present(page)
        await page.click('[data-testid="avatar-generate"]')
        await page.wait_for_selector('[data-testid="credit-quote-modal"]', timeout=12000)
        await page.wait_for_selector('[data-testid="quote-error"]', timeout=12000)
        await page.click('[data-testid="quote-cancel"]', force=True)
        await page.wait_for_timeout(700)
        after_avatar_calls = requests_seen["avatar_generate"]
        await page.screenshot(path=str(ARTIFACT_DIR / "avatar_quote_cancel.jpeg"), quality=40, full_page=False)
        print(f"Avatar quote cancel: avatar calls before={before_avatar_calls} after={after_avatar_calls}")

        # Plans cards + more packs + history
        await page.goto(f"{BASE_URL}/(tabs)/plans", wait_until="domcontentloaded")
        await page.wait_for_selector('[data-testid="plans-screen"]', timeout=12000)
        await page.wait_for_selector('[data-testid="catalog-spark"]', timeout=12000)
        monthly_count = await page.locator('[data-testid^="catalog-"]').count()
        await page.click('[data-testid="plans-purchased-tab"]', force=True)
        await page.wait_for_timeout(500)
        packs_before_more = await page.locator('[data-testid^="catalog-"]').count()
        await page.click('[data-testid="plans-more-packs"]', force=True)
        await page.wait_for_timeout(500)
        packs_after_more = await page.locator('[data-testid^="catalog-"]').count()
        await page.click('[data-testid="plans-credit-history"]', force=True)
        await page.wait_for_selector('[data-testid="credit-history-title"]', timeout=12000)
        await page.screenshot(path=str(ARTIFACT_DIR / "plans_history.jpeg"), quality=40, full_page=False)
        print(f"Catalog counts: monthly={monthly_count}, packs_before_more={packs_before_more}, packs_after_more={packs_after_more}")

        # Admin budget owner-read / locked-write check
        await page.goto(f"{BASE_URL}/admin/budget", wait_until="domcontentloaded")
        await page.wait_for_selector('[data-testid="budget-title"]', timeout=12000)
        await page.wait_for_selector('[data-testid="budget-message"]', timeout=12000)
        save_disabled = await page.locator('[data-testid="budget-save"]').count() == 0
        save_rate_disabled = await page.locator('[data-testid="budget-save-rate"]').count() == 0
        await page.screenshot(path=str(ARTIFACT_DIR / "budget_locked.jpeg"), quality=40, full_page=False)
        print(f"Budget changes hidden for non-owner: budget_save={save_disabled}, save_rate={save_rate_disabled}")

        error_text = await page.evaluate("""() => {
const errorElements = Array.from(document.querySelectorAll('.error, [class*="error"], [id*="error"]'));
return errorElements.map(el => el.textContent).join(", ");
}""")
        if error_text:
            print(f"Found error message: {error_text}")
        else:
            print("No error messages found on the page")

        print(
            f"RESULT: create_cancel_no_provider_call={after_generate_calls == before_generate_calls}; "
            f"avatar_cancel_no_provider_call={after_avatar_calls == before_avatar_calls}; "
            f"all13_cards={monthly_count == 5 and packs_after_more == 8}"
        )

        await context.close()
        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
