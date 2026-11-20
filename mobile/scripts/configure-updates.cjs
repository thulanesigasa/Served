const fs = require('node:fs');
const path = require('node:path');
const configPath = path.resolve(__dirname, '../app.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const projectId = config.expo.extra?.eas?.projectId;
if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(projectId || '')) {
  throw new Error('Link this app to its Expo project before running a build or OTA update.');
}
if (config.expo.runtimeVersion !== '1.0.1') {
  throw new Error('Served’s OTA runtime must be 1.0.1.');
}
config.expo.updates = {
  ...config.expo.updates,
  url: 'https://u.expo.dev/' + projectId,
  checkAutomatically: 'NEVER',
  fallbackToCacheTimeout: 0,
};
fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
