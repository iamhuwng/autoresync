# Debugging Guide

This document provides best practices for debugging common issues in this project.

## 1. Unit Test Failures

### 1.1. `MantineProvider` Not Found

*   **Symptom:** The test fails with the error `@mantine/core: MantineProvider was not found in component tree`.
*   **Cause:** A component that uses Mantine UI is being rendered in a test without being wrapped in a `MantineProvider`.
*   **Solution:** In the test file, wrap the component under test with a `MantineProvider`:

    ```javascript
    import { MantineProvider } from '@mantine/core';

    render(
      <MantineProvider>
        <MyComponent />
      </MantineProvider>
    );
    ```

### 1.2. `window.matchMedia` is not a function

*   **Symptom:** The test fails with the error `TypeError: window.matchMedia is not a function`.
*   **Cause:** The test is running in a Node.js environment where the `window` object is not available.
*   **Solution:** Add a mock for `window.matchMedia` to the test setup file (`src/test/setup.js`):

    ```javascript
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation(query => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
    ```

## 2. Playwright Test Failures

### 2.1. Timeout Errors

*   **Symptom:** The test fails with a `Test timeout of 30000ms exceeded` error.
*   **Cause:** This is often caused by a fundamental issue with the Playwright setup that prevents it from connecting to and controlling the browser.
*   **Troubleshooting Steps:**
    1.  **Check for the "browser is under automated control" warning:** When running a test in headed mode, make sure that the browser window shows this warning. If it does not, there is a connection issue.
    2.  **Update Playwright browsers:** Run `npx playwright install` to make sure you have the latest browser versions.
    3.  **Use the correct browser channel:** If the tests are written for a specific browser, make sure that the `playwright.config.js` is configured to use the correct channel (e.g., `channel: 'chrome'`).
    4.  **Clear the Playwright browser cache:** If all else fails, try deleting the Playwright browser installation folders (on Windows, this is in `%USERPROFILE%\AppData\Local\ms-playwright`) and then reinstalling the browsers.

### 2.2. Manual Testing as a Workaround

If the Playwright tests are not working due to environment issues, you can use the browser tools in the CLI to manually test the functionality.

*   **Process:**
    1.  Start the dev server in the background (`start /b npm run dev` on Windows).
    2.  Use the `navigate_page` tool to navigate to the page.
    3.  Use the `take_snapshot` tool to get the content of the page and the `uid` of the elements you want to interact with.
    4.  Use the `click`, `fill`, and `upload_file` tools to interact with the page.
