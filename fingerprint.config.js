const { SourceSkips } = require('@expo/fingerprint');

module.exports = {
  sourceSkips:
    SourceSkips.ExpoConfigExtraSection |
    SourceSkips.ExpoConfigVersions |
    SourceSkips.ExpoConfigRuntimeVersionIfString,
};
