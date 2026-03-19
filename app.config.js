const { execSync } = require('child_process');
const appJson = require('./app.json');

const baseExpoConfig = appJson.expo ?? {};
const baseAndroidPackage = baseExpoConfig.android?.package ?? 'com.pictag.app';
const baseIosBundleIdentifier = baseExpoConfig.ios?.bundleIdentifier ?? 'com.pictag.app';
const baseScheme = baseExpoConfig.scheme ?? 'pictag';

function resolveAppVariant() {
  const explicitVariant = process.env.APP_VARIANT;
  if (explicitVariant === 'development') return 'development';
  if (explicitVariant === 'production') return 'production';

  return process.env.EAS_BUILD_PROFILE === 'development' ? 'development' : 'production';
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
  };
};
