async def run_test(page, output_dir, page_url):
    try:
        await page.set_viewport_size({"width": 375, "height": 667})
        print("Step 1: Viewport set to mobile")

        await page.wait_for_load_state("domcontentloaded")
        await page.wait_for_timeout(3000)
        print("Step 2: Initial load complete")

        # Check if app shell or login/register content is visible
        body_text = await page.locator("body").inner_text()
        print(f"Step 3: Body text length: {len(body_text)}")

        await page.screenshot(path="/app/test_reports/artifacts_iter20/automation_output/20261026_071114_340da5cc0961/mobile_preview_home.jpeg", type="jpeg", quality=40, full_page=False)
        print("Step 4: Captured mobile preview screenshot")

        # Get error messages using specific selectors
        error_text = await page.evaluate("""() => {
        const errorElements = Array.from(document.querySelectorAll('.error, [class*="error"], [id*="error"]'));
        return errorElements.map(el => el.textContent).join(", ");
        }""")
        if error_text:
          print(f"Found error message: {error_text}")
        else:
          print("No error messages found on the page")

        print("SUCCESS: Frontend preview load validation completed")
    except Exception as e:
        print(f"FAIL: Frontend preview load validation failed: {str(e)}")
        await page.screenshot(path="/app/test_reports/artifacts_iter20/automation_output/20261026_071114_340da5cc0961/mobile_preview_error.jpeg", type="jpeg", quality=40, full_page=False)
