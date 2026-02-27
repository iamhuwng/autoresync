# Development Workflows

This document outlines common development workflows for this project.

## 1. Adding a New Page Route

1.  Create the new page component in the `/src/pages` directory.
2.  Open the `src/App.jsx` file.
3.  Add a new `<Route>` component to the `<Routes>` section, specifying the path and the component to render.

    ```javascript
    import MyNewPage from './pages/MyNewPage.jsx';

    <Route path="/my-new-page" element={<MyNewPage />} />
    ```

## 2. Handling Build Environment Issues

If you encounter persistent build errors after installing new dependencies, it may be due to a caching or dependency issue. To perform a full reset of the Node.js environment, run the following commands:

```bash
# On Windows (Command Prompt)
rmdir /s /q node_modules
del package-lock.json
npm install

# On Windows (PowerShell)
Remove-Item -Recurse -Force ./node_modules
Remove-Item package-lock.json
npm install

# On macOS / Linux
rm -rf node_modules
rm package-lock.json
npm install
```
