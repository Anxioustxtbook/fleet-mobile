const { withAndroidManifest } = require('@expo/config-plugins');

module.exports = function withAndroidCleartextTraffic(config) {
  return withAndroidManifest(config, config => {
    const application = config.modResults.manifest.application?.[0];
    if (!application) {
      throw new Error('AndroidManifest.xml is missing the application element');
    }

    application.$['android:usesCleartextTraffic'] = 'true';
    return config;
  });
};
