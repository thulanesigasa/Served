import { useEffect, useState } from 'react';
import { ActivityIndicator, AppState, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Updates from 'expo-updates';

export function UpdatePrompt() {
  const [prompt, setPrompt] = useState(null);

  useEffect(() => {
    if (!Updates.isEnabled) return;

    let active = true;
    let checking = false;
    let prompting = false;
    let installing = false;
    let nextCheck = 0;
    let deferred;
    let downloaded;

    function dismiss(id) {
      if (installing) return;
      deferred = id;
      prompting = false;
      setPrompt(null);
    }

    async function install(id) {
      if (installing) return;
      installing = true;
      setPrompt({
        title: 'Installing update',
        message: 'Served will restart when the update is ready.',
        busy: true,
      });
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
        installing = false;
        if (!active) return;
        showChoices(id, 'Couldn’t install the update', 'Check your connection and try again when you’re ready.', 'Retry');
      }
    }

    function showChoices(id, title, message, actionLabel) {
      setPrompt({
        title, message, actionLabel,
        onLater: () => dismiss(id),
        onUpdate: () => install(id),
      });
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
        showChoices(id, 'Update available', 'Update now to restart Served, or choose Later to keep using the app.', 'Update');
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

  if (!prompt) return null;

  return (
    <Modal transparent visible animationType="fade" onRequestClose={() => prompt.onLater?.()}>
      <ScrollView style={styles.backdrop} contentContainerStyle={styles.center}>
        <View style={styles.card} accessibilityViewIsModal>
          <Image
            source={require('../assets/splash.png')}
            style={styles.logo}
            resizeMode="contain"
            accessibilityLabel="Served"
          />
          <Text accessibilityRole="header" style={styles.title}>{prompt.title}</Text>
          <Text style={styles.message} accessibilityLiveRegion="polite">{prompt.message}</Text>
          {prompt.busy ? (
            <ActivityIndicator color="#71334f" accessibilityLabel="Installing update" style={styles.progress} />
          ) : (
            <View style={styles.actions}>
              <Pressable accessibilityRole="button" onPress={prompt.onLater} style={styles.later}>
                <Text style={styles.laterText}>Later</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={prompt.onUpdate} style={styles.primary}>
                <Text style={styles.primaryText}>{prompt.actionLabel}</Text>
              </Pressable>
            </View>
          )}
        </View>
      </ScrollView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#251929d9' },
  center: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  card: {
    width: '100%', maxWidth: 380, padding: 22, gap: 12,
    borderRadius: 9, borderWidth: 1, borderColor: '#d2a0ab', backgroundColor: '#fff4e4',
  },
  logo: { width: 104, height: 32 },
  title: { color: '#321e32', fontSize: 25, fontWeight: '800' },
  message: { color: '#57364f', fontSize: 16, lineHeight: 23 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 6 },
  later: {
    flexGrow: 1, minHeight: 46, padding: 12, alignItems: 'center', justifyContent: 'center',
    borderRadius: 6, borderWidth: 1, borderColor: '#a16e88', backgroundColor: '#ffdadc',
  },
  laterText: { color: '#321e32', fontSize: 16, fontWeight: '700' },
  primary: {
    flexGrow: 1, minHeight: 46, padding: 12, alignItems: 'center', justifyContent: 'center',
    borderRadius: 6, backgroundColor: '#3b2540',
  },
  primaryText: { color: '#fff4e4', fontSize: 16, fontWeight: '800' },
  progress: { alignSelf: 'flex-start', marginTop: 6 },
});
