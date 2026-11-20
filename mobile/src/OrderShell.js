import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Linking, Pressable, StyleSheet, Text, Vibration, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useAudioPlayer } from 'expo-audio';
import { WebView } from 'react-native-webview';
import { origin } from './served';

const background = '#251929';
const validId = value => /^[a-f0-9]{32}$/.test(value ?? '');
const allowedPage = input => {
  try {
    const link = new URL(input);
    return link.origin === origin && link.pathname === '/';
  } catch {
    return false;
  }
};

export function OrderShell({ session, onSignOut, onLegacy }) {
  const browser = useRef(null);
  const scanning = useRef(false);
  const pendingLink = useRef(null);
  const loaded = useRef(false);
  const [scanner, setScanner] = useState(false);
  const [failed, setFailed] = useState(false);
  const [permission, askPermission] = useCameraPermissions();
  const player = useAudioPlayer(require('../assets/call.wav'));
  const source = useMemo(() => ({ uri: origin + '/?shell=guest&native=1' }), []);

  function send(name, detail) {
    browser.current?.injectJavaScript(`if (location.origin === ${JSON.stringify(origin)} &&
      new URLSearchParams(location.search).get('native') === '1') {
        window.dispatchEvent(new CustomEvent(${JSON.stringify(name)}, {detail: ${JSON.stringify(detail ?? null)}}));
      } true;`);
  }

  function openLink(value) {
    if (!allowedPage(value)) {
      Alert.alert('Table QR unavailable', 'Scan an official Served table code.');
      return;
    }
    const params = new URL(value).searchParams;
    const table = params.get('table');
    const order = params.get('order');
    if (validId(table)) send('served-table', table);
    else if (validId(order)) send('served-order', order);
    else if (params.has('venue') || params.has('ticket')) onLegacy(value);
    else Alert.alert('Table QR unavailable', 'Ask the restaurant for the QR code for your table.');
  }

  async function startScanner() {
    try {
      const access = permission?.granted ? permission : await askPermission();
      if (!access.granted) {
        Alert.alert('Camera access is off', 'You can paste the table link in the feed.');
        return;
      }
      scanning.current = false;
      setScanner(true);
    } catch { Alert.alert('Camera unavailable', 'You can paste the table link in the feed.'); }
  }

  async function message(event) {
    if (!allowedPage(event.nativeEvent.url)) return;
    let data;
    try { data = JSON.parse(event.nativeEvent.data); }
    catch { return; }
    if (data.action === 'ready-for-session') {
      loaded.current = true;
      send('served-session', { guest:session.guest, token:session.token });
      if (pendingLink.current) {
        openLink(pendingLink.current);
        pendingLink.current = null;
      }
    }
    if (data.action === 'scan') startScanner();
    if (data.action === 'signout') onSignOut();
    if (data.action === 'ready') {
      Vibration.vibrate([0, 180, 100, 200]);
      await player.seekTo(0).catch(() => {});
      player.play();
    }
    if (data.action === 'pay') {
      try {
        const checkout = new URL(data.value);
        if (checkout.origin !== 'https://checkout.paystack.com') return;
        await Linking.openURL(checkout.href);
      } catch { Alert.alert('Checkout could not open', 'Try Resume payment in your feed.'); }
    }
  }

  useEffect(() => {
    const subscription = AppState.addEventListener('change', next => {
      if (next === 'active') send('served-foreground');
    });
    const route = source => {
      const prefix = 'served://open?url=';
      if (!source?.startsWith(prefix)) return;
      try {
        const link = decodeURIComponent(source.slice(prefix.length));
        if (loaded.current) openLink(link);
        else pendingLink.current = link;
      } catch { /* Incomplete deep links can be reopened by scanning the table again. */ }
    };
    Linking.getInitialURL().then(route).catch(() => {});
    const links = Linking.addEventListener('url', event => route(event.url));
    return () => { subscription.remove(); links.remove(); };
  }, []);

  return <SafeAreaView style={styles.shell}>
    <StatusBar style="light" />
    {failed ? <View style={styles.message}>
      <Text style={styles.text}>Could not open your Served feed.</Text>
      <Pressable accessibilityRole="button" onPress={() => setFailed(false)}><Text style={styles.text}>Try again</Text></Pressable>
    </View> : <WebView
      ref={browser}
      source={source}
      originWhitelist={[origin]}
      onShouldStartLoadWithRequest={event => allowedPage(event.url)}
      onMessage={message}
      onLoadStart={() => { loaded.current = false; }}
      javaScriptEnabled
      domStorageEnabled
      setSupportMultipleWindows={false}
      allowFileAccess={false}
      mixedContentMode="never"
      startInLoadingState
      renderLoading={() => <ActivityIndicator color="#f4bfc4" style={styles.loading} />}
      onError={() => setFailed(true)}
      onHttpError={event => { if (allowedPage(event.nativeEvent.url)) setFailed(true); }}
      style={styles.web}
    />}
    {scanner && <View style={styles.scanner}>
      <View style={styles.scannerHeader}><Text accessibilityRole="header" style={styles.text}>Scan your table QR</Text>
        <Pressable accessibilityRole="button" onPress={() => setScanner(false)}><Text style={styles.text}>Close</Text></Pressable></View>
      <CameraView style={styles.web} barcodeScannerSettings={{ barcodeTypes:['qr'] }} onBarcodeScanned={({ data }) => {
        if (scanning.current) return;
        scanning.current = true;
        setScanner(false);
        openLink(data);
      }} />
    </View>}
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  shell: { flex:1, backgroundColor:background },
  web: { flex:1, backgroundColor:background },
  loading: { ...StyleSheet.absoluteFillObject, backgroundColor:background },
  scanner: { ...StyleSheet.absoluteFillObject, backgroundColor:background },
  scannerHeader: { flexDirection:'row', justifyContent:'space-between', padding:19 },
  message: { flex:1, alignItems:'center', justifyContent:'center', gap:18 },
  text: { color:'#fff1e9', fontSize:17, fontWeight:'700' },
});
