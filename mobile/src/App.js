import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, AppState, BackHandler, KeyboardAvoidingView, Linking, Platform,
  Pressable, ScrollView, StyleSheet, Text, TextInput, Vibration, View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useKeepAwake } from 'expo-keep-awake';
import { setAudioModeAsync, useAudioPlayer } from 'expo-audio';
import { randomUUID } from 'expo-crypto';
import { WebView } from 'react-native-webview';
import { guestDestination, origin, request, ticketDetails } from './served';

const LAST_TICKET = 'served.lastTicket';
const colours = { dark: '#12372d', green: '#245f46', text: '#162d25', muted: '#52655b', surface: '#f5f7f5' };

function Button({ children, disabled, onPress, primary = false }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled}
    onPress={onPress} style={({ pressed }) => [styles.button, primary && styles.primary, (pressed || disabled) && styles.dimmed]}>
    <Text style={[styles.buttonText, primary && styles.primaryText]}>{children}</Text>
  </Pressable>;
}
function KeepAwake() {
  useKeepAwake('served-ticket');
  return null;
}
function GuestForm({ venue, onJoin }) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState('table');
  const [size, setSize] = useState('2');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const id = useRef('');
  async function submit() {
    if (saving) return;
    const party = kind === 'table' ? Number(size) : 1;
    if (!name.trim() || !Number.isInteger(party) || party < 1 || party > 20) {
      setError('Enter your name and a party size from 1 to 20.');
      return;
    }
    setError('');
    setSaving(true);
    id.current ||= randomUUID().replaceAll('-', '');
    try {
      onJoin(await request(`venues/${venue.id}/join`, { id: id.current, name: name.trim(), kind, size: party }));
    } catch (problem) {
      setError(problem.message);
      setSaving(false);
    }
  }
  return <>
    <Text style={styles.kicker}>{venue.name}</Text>
    <Text style={styles.title} accessibilityRole="header">Join the queue</Text>
    <Text style={styles.description}>Get a ticket for a table or order pickup.</Text>
    <Text style={styles.label}>Name or order reference</Text>
    <TextInput style={styles.input} accessibilityLabel="Name or order reference" placeholder="e.g. Maya Patel"
      placeholderTextColor={colours.muted} value={name} maxLength={45} onChangeText={setName} />
    <View style={styles.buttons}>
      <Button primary={kind === 'table'} onPress={() => setKind('table')}>Table</Button>
      <Button primary={kind === 'order'} onPress={() => setKind('order')}>Pickup</Button>
    </View>
    {kind === 'table' && <>
      <Text style={styles.label}>Party size</Text>
      <TextInput style={styles.input} accessibilityLabel="Party size" keyboardType="number-pad"
        maxLength={2} value={size} onChangeText={setSize} onSubmitEditing={submit} />
    </>}
    {!!error && <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text>}
    <Button primary disabled={saving} onPress={submit}>{saving ? 'Joining…' : 'Get my ticket'}</Button>
  </>;
}

function Served() {
  const [destination, setDestination] = useState(null);
  const [venue, setVenue] = useState(null);
  const [ticket, setTicket] = useState(null);
  const [lastTicket, setLastTicket] = useState('');
  const [link, setLink] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [camera, setCamera] = useState(false);
  const [staff, setStaff] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [awake, setAwake] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const scanLock = useRef(false);
  const status = useRef(null);
  const player = useAudioPlayer(require('../assets/call.wav'));

  function open(next) {
    setDestination(next);
    setVenue(null);
    setTicket(null);
    setError('');
    setCamera(false);
    setStaff(false);
    status.current = null;
  }
  function openLink(value) {
    try {
      open(guestDestination(value));
    } catch {
      setCamera(false);
      setError('Scan the restaurant’s Served QR code or paste its guest link.');
    }
  }
  function returnHome() {
    open(null);
    setBusy(false);
  }
  function remember(id) {
    setLastTicket(id);
    AsyncStorage.setItem(LAST_TICKET, id).catch(() => {});
  }
  function joined(next) {
    open({ ticket: next.id });
    setTicket(next);
    status.current = next.status;
    remember(next.id);
  }
  async function startCamera() {
    try {
      const access = permission?.granted ? permission : await requestPermission();
      if (!access.granted) {
        setError('Allow camera access in Settings or paste the guest link.');
        return;
      }
      scanLock.current = false;
      setCamera(true);
      setError('');
    } catch {
      setError('Camera unavailable. Paste the guest link instead.');
    }
  }

  useEffect(() => {
    AsyncStorage.getItem(LAST_TICKET).then(value => setLastTicket(previous => previous || value || '')).catch(() => {});
    const appLink = value => {
      const prefix = 'served://open?url=';
      if (!value.startsWith(prefix)) return;
      try { openLink(decodeURIComponent(value.slice(prefix.length))); }
      catch { setError('This Served link is unavailable.'); }
    };
    Linking.getInitialURL().then(value => value && appLink(value)).catch(() => {});
    const handler = Linking.addEventListener('url', event => appLink(event.url));
    return () => handler.remove();
  }, []);

  useEffect(() => {
    if (!destination && !staff && !camera) return;
    const handler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (camera) setCamera(false);
      else returnHome();
      return true;
    });
    return () => handler.remove();
  }, [camera, destination, staff]);

  useEffect(() => {
    if (!destination) return;
    const controller = new AbortController();
    let inFlight = false;
    const path = destination.ticket ? `tickets/${destination.ticket}` : `venues/${destination.venue}`;
    async function refresh() {
      if (inFlight || AppState.currentState === 'background') return;
      inFlight = true;
      try {
        const next = await request(path, null, controller.signal);
        if (controller.signal.aborted) return;
        if (destination.ticket) {
          if (status.current === 'waiting' && next.status === 'ready') {
            Vibration.vibrate([0, 180, 100, 200]);
            if (soundOn) {
              await player.seekTo(0).catch(() => {});
              if (!controller.signal.aborted) player.play();
            }
          }
          if (controller.signal.aborted) return;
          status.current = next.status;
          setTicket(next);
          if (next.id !== lastTicket) remember(next.id);
        } else {
          setVenue(next);
        }
        setError('');
      } catch (problem) {
        if (!controller.signal.aborted) setError(problem.message);
      } finally {
        if (!controller.signal.aborted) setBusy(false);
        inFlight = false;
      }
    }
    setBusy(true);
    refresh();
    const interval = destination.ticket ? setInterval(refresh, 3500) : null;
    const foreground = AppState.addEventListener('change', state => { if (state === 'active') refresh(); });
    return () => {
      controller.abort();
      clearInterval(interval);
      foreground.remove();
    };
  }, [destination, lastTicket, player, soundOn]);

  const waiting = ticket?.status === 'waiting';
  const [title, detail] = ticket ? ticketDetails(ticket) : [];
  return <SafeAreaView style={styles.safe}>
    <StatusBar style="dark" />
    <View style={styles.top}>
      <Text accessibilityRole="header" style={styles.brand}>Served</Text>
      {(camera || staff || destination) && <Button onPress={camera ? () => setCamera(false) : returnHome}>Back</Button>}
    </View>
    {camera ? <CameraView style={styles.camera} barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
      onBarcodeScanned={({ data }) => {
        if (scanLock.current) return;
        scanLock.current = true;
        openLink(data);
      }} />
      : staff ? <WebView source={{ uri: origin + '/' }} originWhitelist={[origin]}
        onShouldStartLoadWithRequest={event => event.url === origin || event.url.startsWith(origin + '/')}
        setSupportMultipleWindows={false} style={styles.camera} />
      : <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
          <View style={[styles.card, ticket?.status === 'ready' && styles.ready]}>
            {ticket ? <>
              <Text style={styles.kicker}>{ticket.venue_name}</Text>
              <Text accessibilityRole="header" accessibilityLiveRegion="polite" style={styles.title}>{title}</Text>
              <Text style={styles.ticketNo}>#{String(ticket.number).padStart(3, '0')}</Text>
              <Text style={styles.description}>{detail}</Text>
              {!!error && <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text>}
              {waiting && <>
                {awake && <KeepAwake />}
                <View style={styles.buttons}>
                  <Button onPress={async () => {
                    if (!soundOn) await setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
                    setSoundOn(!soundOn);
                  }}>{soundOn ? 'Mute sound' : 'Enable sound'}</Button>
                  <Button onPress={() => setAwake(!awake)}>{awake ? 'Screen awake' : 'Keep screen awake'}</Button>
                </View>
                <Text style={styles.description}>Keep Served open to receive your call.</Text>
              </>}
            </> : venue ? <GuestForm key={venue.id} venue={venue} onJoin={joined} />
              : destination ? <>
                <Text style={styles.title}>{busy ? 'Opening your queue' : 'Queue unavailable'}</Text>
                {busy ? <ActivityIndicator color={colours.green} /> : <>
                  <Text style={styles.error}>{error}</Text>
                  <Button onPress={() => open({ ...destination })}>Try again</Button>
                </>}
              </> : <>
                <Text accessibilityRole="header" style={styles.title}>Find your queue</Text>
                <Text style={styles.description}>Scan the restaurant’s QR code or paste its guest link.</Text>
                <Button primary onPress={startCamera}>Scan guest QR</Button>
                <Text style={styles.label}>Guest link</Text>
                <TextInput value={link} onChangeText={setLink} autoCapitalize="none" autoCorrect={false}
                  accessibilityLabel="Guest link" keyboardType="url" placeholder="Paste the restaurant link"
                  placeholderTextColor={colours.muted} style={styles.input} onSubmitEditing={() => openLink(link)} />
                <Button onPress={() => openLink(link)}>Open queue</Button>
                {!!error && <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text>}
                {!!lastTicket && <Button onPress={() => open({ ticket: lastTicket })}>Open my last ticket</Button>}
              </>}
          </View>
          {!destination && <Button onPress={() => { setStaff(true); setError(''); }}>Staff dashboard</Button>}
        </ScrollView>
      </KeyboardAvoidingView>}
  </SafeAreaView>;
}

export default function App() {
  return <SafeAreaProvider><Served /></SafeAreaProvider>;
}
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colours.surface },
  flex: { flex: 1 },
  top: { paddingHorizontal: 20, paddingVertical: 10, minHeight: 63, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { color: colours.dark, fontSize: 27, fontWeight: '800', letterSpacing: -1.5 },
  content: { padding: 17, gap: 15, width: '100%', maxWidth: 560, alignSelf: 'center' },
  card: { borderWidth: 1, borderColor: '#dce8de', borderRadius: 20, padding: 21, backgroundColor: '#fff', gap: 12 },
  ready: { backgroundColor: '#dff3e5', borderColor: '#b9dfc3' },
  kicker: { color: colours.muted, fontSize: 15, fontWeight: '700' },
  title: { color: colours.text, fontSize: 34, fontWeight: '800', letterSpacing: -1.4 },
  description: { color: colours.muted, fontSize: 16, lineHeight: 23 },
  label: { color: colours.text, fontSize: 15, fontWeight: '700', marginTop: 4 },
  input: { borderWidth: 1, borderColor: '#cadbd0', borderRadius: 9, padding: 12, fontSize: 16, color: colours.text, minHeight: 47 },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  button: { borderColor: '#dce6de', borderWidth: 1, borderRadius: 9, minHeight: 45, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 13, paddingVertical: 8, backgroundColor: '#fff' },
  buttonText: { fontSize: 15, fontWeight: '700', color: colours.green },
  primary: { backgroundColor: colours.green, borderColor: colours.green },
  primaryText: { color: '#fff' },
  dimmed: { opacity: .65 },
  error: { color: '#942817', fontSize: 15, lineHeight: 21 },
  camera: { flex: 1, backgroundColor: '#fff' },
  ticketNo: { color: colours.text, fontSize: 59, letterSpacing: -4, fontWeight: '800' },
});
