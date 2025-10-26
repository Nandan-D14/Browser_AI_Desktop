from playwright.sync_api import Page, expect

def test_google_drive_integration(page: Page):
    """
    This test verifies that the Google Drive integration is working.
    """
    # 1. Arrange: Go to the application.
    page.goto("http://localhost:3000")

    # 2. Assert: Check that the "Google Drive" app icon is visible in the taskbar.
    expect(page.get_by_role("button", name="Google Drive")).to_be_visible()

    # 3. Screenshot: Capture the final result for visual verification.
    page.screenshot(path="jules-scratch/verification/google-drive-integration.png")
