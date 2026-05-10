import path from 'node:path';
import { createServer, version as viteVersion } from 'vite';
import { ViteNodeRunner } from 'vite-node/client';
import { ViteNodeServer } from 'vite-node/server';
import { installSourcemapsSupport } from 'vite-node/source-map';

const ROOT = process.cwd();

let runtimePromise;
let modulesPromise;

async function createRuntime() {
  const server = await createServer({
    root: ROOT,
    configFile: false,
    appType: 'custom',
    logLevel: 'error',
    resolve: {
      alias: {
        '@': path.join(ROOT, 'src'),
        '@components': path.join(ROOT, 'src', 'components'),
        '@pages': path.join(ROOT, 'src', 'pages'),
        '@services': path.join(ROOT, 'src', 'services'),
        '@hooks': path.join(ROOT, 'src', 'hooks'),
      },
    },
    optimizeDeps: {
      noDiscovery: true,
      include: [],
    },
  });

  if (Number(viteVersion.split('.')[0]) < 6) {
    await server.pluginContainer.buildStart({});
  }

  const node = new ViteNodeServer(server);
  installSourcemapsSupport({
    getSourceMap: (source) => node.getSourceMap(source),
  });

  const runner = new ViteNodeRunner({
    root: server.config.root,
    base: server.config.base,
    fetchModule(id) {
      return node.fetchModule(id);
    },
    resolveId(id, importer) {
      return node.resolveId(id, importer);
    },
  });

  return {
    server,
    runner,
  };
}

async function getRuntime() {
  runtimePromise ??= createRuntime();
  return runtimePromise;
}

async function executeTsModule(relativePath) {
  const runtime = await getRuntime();
  const absolutePath = path.resolve(ROOT, relativePath);
  return runtime.runner.executeFile(absolutePath);
}

export async function loadTableCompletionSharedModules() {
  modulesPromise ??= Promise.all([
    executeTsModule('src/types/tableCompletion.ts'),
    executeTsModule('src/services/test-creation/tableCompletionCanonicalizer.ts'),
    executeTsModule('src/services/test-creation/tableCompletionTransforms.ts'),
    executeTsModule('src/services/test-creation/tableCompletionValidator.ts'),
  ]).then(([tableCompletionTypes, canonicalizer, transforms, validator]) => ({
    tableCompletionTypes,
    canonicalizer,
    transforms,
    validator,
  }));

  return modulesPromise;
}

export async function closeTableCompletionRuntime() {
  if (!runtimePromise) {
    modulesPromise = undefined;
    return;
  }

  const runtime = await runtimePromise;
  runtimePromise = undefined;
  modulesPromise = undefined;
  await runtime.server.close();
}
