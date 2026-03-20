const { execSync } = require('child_process');
const appJson = require('./app.json');

const baseExpoConfig = appJson.expo ?? {};
const baseAndroidPackage = baseExpoConfig.android?.package ?? 'com.pictag.app';
const baseIosBundleIdentifier = baseExpoConfig.ios?.bundleIdentifier ?? 'com.pictag.app';
const baseScheme = baseExpoConfig.scheme ?? 'pictag';

function resolveAndroidBuildArchs() {
  const explicitBuildArchs = process.env.ANDROID_BUILD_ARCHS;
  if (typeof explicitBuildArchs === 'string' && explicitBuildArchs.trim().length > 0) {
    return explicitBuildArchs
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
  }

  return undefined;
}

function resolveAppVariant() {
  const explicitVariant = process.env.APP_VARIANT;
  if (explicitVariant === 'development') return 'development';
  if (explicitVariant === 'production') return 'production';

  return process.env.EAS_BUILD_PROFILE === 'development' ? 'development' : 'production';
}

function withBuildPropertiesPlugin(plugins, androidBuildArchs, isDevelopment) {
  const normalizedPlugins = Array.isArray(plugins) ? plugins : [];
  const filteredPlugins = normalizedPlugins.filter((plugin) => {
    const pluginName = Array.isArray(plugin) ? plugin[0] : plugin;
    return pluginName !== 'expo-build-properties';
  });

  const androidBuildProperties = {
    enableBundleCompression: false,
    enableMinifyInReleaseBuilds: !isDevelopment,
    enableShrinkResourcesInReleaseBuilds: !isDevelopment,
    useLegacyPackaging: false,
  };

  if (Array.isArray(androidBuildArchs) && androidBuildArchs.length > 0) {
    androidBuildProperties.buildArchs = androidBuildArchs;
  }

  filteredPlugins.push([
    'expo-build-properties',
    {
      android: androidBuildProperties,
    },
  ]);

  return filteredPlugins;
}

function resolveGitCommitShort() {
  const explicitCommit = process.env.APP_GIT_COMMIT_SHORT;
  if (typeof explicitCommit === 'string' && explicitCommit.trim().length > 0) {
    return explicitCommit.trim();
  }

  try {
    const commit = execSync('git rev-parse --short HEAD', {
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
    return commit.length > 0 ? commit : null;
  } catch {
    return null;
  }
}

module.exports = () => {
  const variant = resolveAppVariant();
  const isDevelopment = variant === 'development';
  const androidBuildArchs = resolveAndroidBuildArchs();
  const gitCommitShort = resolveGitCommitShort();

  return {
    ...baseExpoConfig,
    name: isDevelopment ? `${baseExpoConfig.name} Dev` : baseExpoConfig.name,
    scheme: isDevelopment ? `${baseScheme}-dev` : baseScheme,
    ios: {
      ...baseExpoConfig.ios,
      bundleIdentifier: isDevelopment
        ? `${baseIosBundleIdentifier}.dev`
        : baseIosBundleIdentifier,
    },
    android: {
      ...baseExpoConfig.android,
      package: isDevelopment ? `${baseAndroidPackage}.dev` : baseAndroidPackage,
    },
    extra: {
      ...baseExpoConfig.extra,
      appVariant: variant,
      gitCommitShort,
    },
    plugins: withBuildPropertiesPlugin(
      baseExpoConfig.plugins,
      androidBuildArchs,
      isDevelopment
    ),
  };
};
