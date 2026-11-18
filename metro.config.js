const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.watchFolders = [path.resolve(__dirname, 'shared')];

/* exceljs's "browser" build (dist/exceljs.min.js) bundles core-js + regenerator polyfills.
   On Hermes, core-js decides the native Promise is "broken" and replaces global.Promise,
   which fights React Native's own promise/rejection tracking and ends in
   "RangeError: Maximum call stack size exceeded (native stack depth)".
   The "bare" build is the same library without those polyfills. */
const EXCELJS_BARE = path.resolve(__dirname, 'node_modules/exceljs/dist/exceljs.bare.min.js');
const upstreamResolve = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'exceljs') return { type: 'sourceFile', filePath: EXCELJS_BARE };
  return upstreamResolve ? upstreamResolve(context, moduleName, platform) : context.resolveRequest(context, moduleName, platform);
};

if (!config.resolver.assetExts.includes('wasm')) {
  config.resolver.assetExts.push('wasm');
}

config.server.enhanceMiddleware = middleware => {
  return (req, res, next) => {
    res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    return middleware(req, res, next);
  };
};

module.exports = config;
