import pytest
from playwright.sync_api import Page, expect

def test_lms_demo(page: Page) -> None:
    # 1. Set Viewport
    # Note: Playwright sets viewports via context, but we can set it on the page directly.
    page.set_viewport_size({"width": 1536, "height": 729})

    # 2. Navigate to the LMS URL
    page.goto("https://lms.nimc.gov.ng/")
    
    # Assert page title matches the recording's expectation
    expect(page).to_have_title("NIMC LMS")

    # 3. Simulate Tab key up (from the recording sequence)
    page.keyboard.up("Tab")

    # 4. Click the Email Address field
    # Using the CSS selector from the JSON (#email)
    email_input = page.locator("#email")
    email_input.click()

    # 5 & 6 & 7. Fill in the email address 
    # (The JSON shows a partial type 'sme1@' then 'sme1@example.com')
    email_input.fill("sme1@example.com")

    # 8 & 9. Press and release Tab to move to the password field
    page.keyboard.press("Tab")

    # 10. Fill in the password field
    password_input = page.locator("#password")
    password_input.fill("password123")

    # 11. Click the Sign In button
    # Using a robust text locator combined with the button tag based on your selectors
    sign_in_button = page.locator("button:has-text('Sign In')")
    sign_in_button.click()

    # 12. Wait for new page title to end with /sme
    expect(page).to_have_url(".*/sme", timeout=20000)
