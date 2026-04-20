let SourceSkips;

try {
  ({ SourceSkips } = require('@expo/fingerprint'));
} catch {
  SourceSkips = null;
}

// Keep `expo.extra` out of fingerprint hashing to avoid runtime-only
// config changes (e.g. pgyer appKey/channel flags) causing hash drift.
module.exports = SourceSkips
  ? {
      sourceSkips:
        SourceSkips.ExpoConfigExtraSection |
        SourceSkips.ExpoConfigVersions |
        SourceSkips.ExpoConfigRuntimeVersionIfString,
    }
  : {};
