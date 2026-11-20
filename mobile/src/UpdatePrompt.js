import { useEffect } from 'react';
import { Alert, AppState } from 'react-native';
import * as Updates from 'expo-updates';

export function UpdatePrompt() {
  useEffect(() => {
    if (!Updates.isEnabled) return;

    let active = true;
    let checking = false;
    let prompting = false;
    let nextCheck = 0;
    let deferred;
    let downloaded;

    function dismiss(id) {
      deferred = id;
      prompting = false;
    }

    async function install(id) {
      try {
        if (downloaded !== id) {
          const result = await Updates.fetchUpdateAsync();
          if (!result.isNew && !result.isRollBackToEmbedded) {
            throw new Error('No update was downloaded.');
          }
          downloaded = id;
        }
        await Updates.reloadAsync();
      } catch {
        if (!active) return;
        Alert.alert('Couldn’t install the update', 'Check your connection and try again when you’re ready.', [
          { text:'Later', style:'cancel', onPress:() => dismiss(id) },
          { text:'Retry', onPress:() => install(id) },
        ], { cancelable:true, onDismiss:() => dismiss(id) });
      }
    }

    async function check() {
      if (!active || checking || prompting || Date.now() < nextCheck) return;
      checking = true;
      nextCheck = Date.now() + 60_000;
      try {
        const update = await Updates.checkForUpdateAsync();
        if (!active || AppState.currentState !== 'active' || (!update.isAvailable && !update.isRollBackToEmbedded)) return;
        const id = update.manifest?.id || 'embedded';
        if (id === deferred) return;
        prompting = true;
        Alert.alert('Served update available', 'Install the update now to restart Served, or choose Later and keep using the app.', [
          { text:'Later', style:'cancel', onPress:() => dismiss(id) },
          { text:'Update', onPress:() => install(id) },
        ], { cancelable:true, onDismiss:() => dismiss(id) });
      } catch {
        // An unavailable update check should not interrupt ordering.
      } finally {
        checking = false;
      }
    }

    if (AppState.currentState === 'active') check();
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') check();
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  return null;
}
