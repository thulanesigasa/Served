import React, { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo, ActivityIndicator, Alert, Animated, AppState, BackHandler, KeyboardAvoidingView, Linking, Platform,
  Pressable, ScrollView, StyleSheet, Text, TextInput, Vibration, View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useKeepAwake } from 'expo-keep-awake';
import { setAudioModeAsync, useAudioPlayer } from 'expo-audio';
import { randomUUID } from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { Entry } from './Entry';
import { OrderShell } from './OrderShell';
import { guestDestination, origin, request, ticketDetails } from './served';

const WELCOME_KEY = 'served.welcomeSeen';
const SESSION_KEY = 'served.guestSession';
const colours = {
  surface: '#251929', ink: '#321e32', muted: '#57364f', paper: '#f7cdd0',
  rose: '#f4bfc4', cream: '#fff4e4', ready: '#71334f',
};
const headline = Platform.select({ android: 'sans-serif-condensed', ios: 'AvenirNextCondensed-Heavy' });
const mono = Platform.select({ android: 'monospace', ios: 'Courier' });

function ordinalSuffix(position) {
  const lastTwo = position % 100;
  if (lastTwo >= 11 && lastTwo <= 13) return 'th';
  return ({ 1: 'st', 2: 'nd', 3: 'rd' })[position % 10] || 'th';
}

function Button({ children, disabled, onPress, primary = false, onDark = false }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled}
    onPress={onPress} style={({ pressed }) => [styles.button, onDark && styles.darkButton, primary && styles.primary, (pressed || disabled) && styles.dimmed]}>
    <Text style={[styles.buttonText, onDark && styles.darkButtonText, primary && styles.primaryText]}>{children}</Text>
  </Pressable>;
}
function KeepAwake() {
  useKeepAwake('served-ticket');
  return null;
}
function GuestForm({ venue, guestName, onJoin }) {
  const [name, setName] = useState(guestName);
  const [kind, setKind] = useState('table');
  const [size, setSize] = useState('2');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const id = useRef('');
  const attempt = useRef(null);
  useEffect(() => () => attempt.current?.abort(), []);
  async function submit() {
    if (attempt.current) return;
    const party = kind === 'table' ? Number(size) : 1;
    if (!name.trim() || !Number.isInteger(party) || party < 1 || party > 20) {
      setError('Enter your name and a party size from 1 to 20.');
      return;
    }
    setError('');
    setSaving(true);
    id.current ||= randomUUID().replaceAll('-', '');
    const active = new AbortController();
    attempt.current = active;
    try {
      const motion = await AccessibilityInfo.isReduceMotionEnabled().catch(() => false);
      const [ticket] = await Promise.all([
        request(`venues/${venue.id}/join`, { id: id.current, name: name.trim(), kind, size: party }, active.signal),
        new Promise(resolve => setTimeout(resolve, motion ? 0 : 650)),
      ]);
      if (!active.signal.aborted) onJoin(ticket, !motion);
    } catch (problem) {
      if (!active.signal.aborted) {
        setError(problem.message);
        setSaving(false);
      }
    } finally {
      attempt.current = null;
    }
  }
  if (saving) return <View accessibilityLiveRegion="polite" style={styles.ticketBuild}>
    <ActivityIndicator size="large" color={colours.ink} />
    <Text accessibilityRole="header" style={styles.positionCaption}>Building your ticket</Text>
  </View>;
  return <>
    <View style={styles.ticketHeader}><Text style={styles.kicker}>{venue.name}</Text><Text style={styles.stamp}>Guest queue</Text></View>
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

function Served({ guest, initialLink, onBack }) {
  const lastTicketKey = 'served.lastTicket.' + guest.id;
  const [destination, setDestination] = useState(null);
  const [venue, setVenue] = useState(null);
  const [ticket, setTicket] = useState(null);
  const [lastTicket, setLastTicket] = useState('');
  const [link, setLink] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [camera, setCamera] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [awake, setAwake] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const scanLock = useRef(false);
  const status = useRef(null);
  const reveal = useRef(new Animated.Value(1)).current;
  const player = useAudioPlayer(require('../assets/call.wav'));

  function open(next) {
    setDestination(next);
    setVenue(null);
    setTicket(null);
    setError('');
    setCamera(false);
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
    AsyncStorage.setItem(lastTicketKey, id).catch(() => {});
  }
  function joined(next, animate) {
    open({ ticket: next.id });
    setTicket(next);
    status.current = next.status;
    remember(next.id);
    if (animate) {
      reveal.setValue(0);
      Animated.timing(reveal, { toValue: 1, duration: 290, useNativeDriver: true }).start();
    }
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
    AsyncStorage.getItem(lastTicketKey).then(value => setLastTicket(previous => previous || value || '')).catch(() => {});
    if (initialLink) openLink(initialLink);
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
  const ready = ticket?.status === 'ready';
  const [title, detail] = ticket ? ticketDetails(ticket) : [];
  return <SafeAreaView style={styles.safe}>
    <StatusBar style="light" />
    <View style={styles.top}>
      <Text accessibilityRole="header" style={styles.brand}>Served</Text>
      {(camera || destination) && <Button onDark onPress={camera ? () => setCamera(false) : returnHome}>{camera ? 'Close scanner' : 'My queue'}</Button>}
    </View>
    {camera ? <CameraView style={styles.camera} barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
      onBarcodeScanned={({ data }) => {
        if (scanLock.current) return;
        scanLock.current = true;
        openLink(data);
      }} />
      : <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
          <Animated.View style={[styles.card, ready && styles.ready, { opacity: reveal,
            transform: [{ translateY: reveal.interpolate({ inputRange: [0, 1], outputRange: [-9, 0] }) }] }]}>
            {ticket ? <>
              <View style={[styles.ticketHeader, ready && styles.readyRule]}>
                <Text style={[styles.kicker, ready && styles.readyText]}>{ticket.venue_name}</Text>
                <Text style={[styles.stamp, ready && styles.readyText]}>{waiting ? 'In the queue' : ready ? 'Called' : ticket.status === 'done' ? 'Completed' : 'Cancelled'}</Text>
              </View>
              {waiting ? <View accessible accessibilityRole="header"
                accessibilityLabel={`You’re ${ticket.position}${ordinalSuffix(ticket.position)} in line`}>
                <Text style={styles.positionCaption}>You’re</Text>
                <View style={styles.positionRow}>
                  <Text style={styles.position}>{ticket.position}</Text>
                  <Text style={styles.positionSuffix}>{ordinalSuffix(ticket.position)}</Text>
                </View>
                <Text style={styles.positionCaption}>in line</Text>
              </View> : <Text accessibilityRole="header" accessibilityLiveRegion="polite"
                style={[styles.title, ready && styles.readyText]}>{title}</Text>}
              {waiting && Number.isFinite(ticket.estimated_wait_minutes) &&
                <Text style={styles.estimate}>Estimated wait · about {ticket.estimated_wait_minutes} min</Text>}
              <Text style={[styles.description, ready && styles.readyText]}>{detail}</Text>
              <View style={[styles.stub, ready && styles.readyRule]}>
                <View style={[styles.stubNumber, ready && styles.readyRule]}>
                  <Text style={[styles.stamp, ready && styles.readyText]}>Ticket</Text>
                  <Text style={[styles.ticketNo, ready && styles.readyText]}>#{String(ticket.number).padStart(3, '0')}</Text>
                </View>
                <View style={styles.stubDetails}>
                  <Text style={[styles.label, ready && styles.readyText]}>{ticket.name}</Text>
                  <Text style={[styles.description, ready && styles.readyText]}>{ticket.kind === 'table' ? `Table for ${ticket.size}` : 'Order pickup'}</Text>
                  <Text style={[styles.description, ready && styles.readyText]}>
                    Joined at {new Date(ticket.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                  </Text>
                </View>
              </View>
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
            </> : venue ? <GuestForm key={venue.id} guestName={guest.name} venue={venue} onJoin={joined} />
              : destination ? <>
                <Text style={styles.title}>{busy ? 'Opening your queue' : 'Queue unavailable'}</Text>
                {busy ? <ActivityIndicator color={colours.ink} /> : <>
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
          </Animated.View>
          {!destination && <Button onDark onPress={onBack}>Back to ordering</Button>}
        </ScrollView>
      </KeyboardAvoidingView>}
  </SafeAreaView>;
}

function GuestApp() {
  const [state, setState] = useState({ loading: true, welcome: false, session: null });
  const confirmingExit = useRef(false);
  const [legacy, setLegacy] = useState(null);
  useEffect(() => {
    let active = true;
    async function start() {
      let welcome = false;
      let session = null;
      try {
        const [seen, stored] = await Promise.all([
          AsyncStorage.getItem(WELCOME_KEY), SecureStore.getItemAsync(SESSION_KEY),
        ]);
        welcome = seen === '1';
        if (stored) {
          const previous = JSON.parse(stored);
          if (previous.token && previous.guest && previous.expires_at > Date.now()) {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 5000);
            try {
              const current = await request('guests/session', undefined, controller.signal, previous.token);
              session = { ...previous, guest: current.guest };
            } catch (error) {
              if (error.status !== 401) session = previous;
            } finally {
              clearTimeout(timeout);
            }
          }
          if (!session) await SecureStore.deleteItemAsync(SESSION_KEY);
        }
      } catch {
        // A device without readable stored credentials can sign in again.
      }
      if (active) setState({ loading: false, welcome, session });
    }
    start();
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!state.session || Platform.OS !== 'android') return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!confirmingExit.current) {
        confirmingExit.current = true;
        const close = () => { confirmingExit.current = false; };
        Alert.alert('Exit Served?', 'You’ll stay signed in on this device.', [
          { text: 'Stay', style: 'cancel', onPress: close },
          { text: 'Exit', onPress: () => { close(); BackHandler.exitApp(); } },
        ], { cancelable: true, onDismiss: close });
      }
      return true;
    });
    return () => subscription.remove();
  }, [state.session]);

  async function completeWelcome() {
    await AsyncStorage.setItem(WELCOME_KEY, '1').catch(() => {});
    setState(previous => ({ ...previous, welcome: true }));
  }
  async function signIn(session) {
    await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session));
    setState(previous => ({ ...previous, session }));
  }
  async function signOut() {
    try {
      await SecureStore.deleteItemAsync(SESSION_KEY);
    } catch {
      Alert.alert('Could not sign out', 'Try again.');
      return;
    }
    setState(previous => ({ ...previous, session: null }));
    request('guests/logout', {}, undefined, state.session.token).catch(() => {});
  }
  if (state.session) return legacy
    ? <Served guest={state.session.guest} initialLink={legacy} onBack={() => setLegacy(null)} />
    : <OrderShell session={state.session} onSignOut={signOut} onLegacy={setLegacy} />;
  return <SafeAreaView style={styles.safe}>
    <StatusBar style="light" />
    {state.loading ? <ActivityIndicator color={colours.rose} style={styles.boot} />
      : <Entry ready={state.welcome} onWelcome={completeWelcome} onSession={signIn} />}
  </SafeAreaView>;
}

export default function App() {
  return <SafeAreaProvider><GuestApp /></SafeAreaProvider>;
}
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colours.surface },
  flex: { flex: 1 },
  top: {
    paddingHorizontal: 20, paddingVertical: 10, minHeight: 63, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'space-between',
  },
  brand: { color: colours.cream, fontFamily: headline, fontSize: 38, fontWeight: '800', letterSpacing: -1 },
  content: { padding: 17, gap: 15, width: '100%', maxWidth: 520, alignSelf: 'center' },
  card: { borderWidth: 1, borderColor: '#d2a0ab', borderRadius: 9, padding: 21, backgroundColor: colours.paper, gap: 13 },
  ready: { backgroundColor: colours.ready, borderColor: '#b7859b' },
  readyRule: { borderColor: '#c693a9' },
  readyText: { color: colours.cream },
  ticketHeader: {
    flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'baseline',
    gap: 8, borderBottomWidth: 1, borderColor: '#96657d', paddingBottom: 11,
  },
  kicker: { color: colours.ink, fontSize: 15, fontWeight: '700', flexShrink: 1 },
  stamp: { color: colours.muted, fontFamily: mono, fontSize: 13, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  title: { color: colours.ink, fontFamily: headline, fontSize: 52, lineHeight: 51, fontWeight: '800', letterSpacing: -1 },
  description: { color: colours.muted, fontSize: 16, lineHeight: 23 },
  label: { color: colours.ink, fontSize: 15, fontWeight: '700' },
  input: { borderWidth: 1, borderColor: '#99697f', borderRadius: 5, padding: 12, fontSize: 16, color: colours.ink, backgroundColor: '#ffe2e3', minHeight: 47 },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  button: { borderColor: '#a16e88', borderWidth: 1, borderRadius: 6, minHeight: 45, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 13, paddingVertical: 8, backgroundColor: '#ffdadc' },
  buttonText: { fontSize: 15, fontWeight: '700', color: colours.ink },
  darkButton: { backgroundColor: '#3c2a41', borderColor: '#725a77' },
  darkButtonText: { color: colours.cream },
  primary: { backgroundColor: '#3b2540', borderColor: '#3b2540' },
  primaryText: { color: colours.cream },
  dimmed: { opacity: .65 },
  error: { color: '#821d35', fontSize: 15, lineHeight: 21 },
  camera: { flex: 1, backgroundColor: colours.surface },
  positionCaption: { color: colours.ink, fontFamily: headline, fontSize: 31, lineHeight: 31, fontWeight: '800' },
  positionRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 5 },
  position: { color: colours.ink, fontFamily: headline, fontSize: 123, fontWeight: '900', letterSpacing: -5, lineHeight: 115, includeFontPadding: false },
  positionSuffix: { color: colours.ink, fontFamily: headline, fontSize: 36, lineHeight: 41, fontWeight: '800' },
  estimate: { color: colours.ink, fontSize: 17, fontWeight: '800' },
  ticketBuild: { minHeight: 230, gap: 18, alignItems: 'center', justifyContent: 'center' },
  boot: { flex: 1 },
  stub: { flexDirection: 'row', gap: 15, borderTopWidth: 2, borderStyle: 'dashed', borderColor: '#96657d', paddingTop: 13, marginTop: 2 },
  stubNumber: { borderRightWidth: 1, borderColor: '#a26c83', paddingRight: 15 },
  stubDetails: { flex: 1, minWidth: 0, justifyContent: 'center' },
  ticketNo: { color: colours.ink, fontFamily: headline, fontSize: 37, fontWeight: '800', letterSpacing: -1 },
});
