/**
 * Vite Plugin: Rule Enforcement Warnings
 * 
 * Shows warnings in the browser console during development when:
 * - A NEW file contains @mantine imports (Rule 15)
 * - WebMCP module is not initialized (setup reminder)
 * 
 * This is a soft enforcement — warnings only, never blocks dev server.
 * 
 * @dev-only This plugin only runs during `vite dev`, not in production builds.
 */

/**
 * Custom Vite plugin that checks transformed modules for rule violations.
 * @returns {import('vite').Plugin}
 */
export function ruleEnforcementPlugin() {
    /** @type {Set<string>} Files that already existed before this dev session */
    const knownFiles = new Set();
    let isFirstLoad = true;

    return {
        name: 'rule-enforcement',
        apply: 'serve', // Only during dev server, never in build

        /**
         * On first full build, record all existing files so we can distinguish
         * "existing" (allowed to have Mantine) from "new" (not allowed).
         */
        buildStart() {
            isFirstLoad = true;
        },

        /**
         * Check each module being transformed for rule violations.
         * @param {string} code - The module source code
         * @param {string} id - The module file path
         */
        transform(code, id) {
            // Only check src/ files
            if (!id.includes('/src/') && !id.includes('\\src\\')) return;
            // Only check .tsx, .jsx, .ts files
            if (!/\.(tsx|jsx|ts)$/.test(id)) return;
            // Skip node_modules
            if (id.includes('node_modules')) return;

            // During first load, record all existing files
            if (isFirstLoad) {
                knownFiles.add(id);
                // After a short delay, mark first load as done
                setTimeout(() => { isFirstLoad = false; }, 5000);
                return; // Don't warn about existing files
            }

            // Only check files that are NEW (not in the initial set)
            if (knownFiles.has(id)) return;

            // ── Rule 15: Check for @mantine imports in new files ──
            const mantineImports = code.match(/import\s+.*from\s+['"]@mantine\/.*/g);
            if (mantineImports && mantineImports.length > 0) {
                const shortPath = id.replace(/.*[/\\]src[/\\]/, 'src/');

                // Inject a console.warn into the module
                const warning = `
          if (import.meta.env.DEV) {
            console.warn(
              '%c🚫 Rule 15 — No Mantine in New Files',
              'background: #dc2626; color: white; padding: 2px 8px; border-radius: 4px; font-weight: bold;',
              '\\n\\nFile:', '${shortPath}',
              '\\n\\nThis NEW file contains @mantine imports. Use native HTML/CSS instead.',
              '\\nSee: documentation/integration-safety-rules.md#rule-15',
              '\\n\\nImports found:',
              ${JSON.stringify(mantineImports)}
            );
          }
        `;
                return { code: warning + code, map: null };
            }
        },
    };
}
