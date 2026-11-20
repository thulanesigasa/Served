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
const colours = {
  surface: '#251929', ink: '#321e32', muted: '#57364f', paper: '#f7cdd0',
  rose: '#f4bfc4', cream: '#fff4e4', butter: '#f6d488', green: '#176342',
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
  const ready = ticket?.status === 'ready';
  const [title, detail] = ticket ? ticketDetails(ticket) : [];
  return <SafeAreaView style={styles.safe}>
    <StatusBar style="light" />
    <View style={styles.top}>
      <Text accessibilityRole="header" style={styles.brand}>Served</Text>
      {(camera || staff || destination) && <Button onDark onPress={camera ? () => setCamera(false) : returnHome}>Back</Button>}
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
          <View style={[styles.card, ready && styles.ready]}>
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
              <Text style={[styles.description, waiting && styles.queueNote, ready && styles.readyText]}>{detail}</Text>
              <View style={[styles.stub, ready && styles.readyRule]}>
                <View style={[styles.stubNumber, ready && styles.readyRule]}>
                  <Text style={[styles.stamp, ready && styles.readyText]}>Ticket</Text>
                  <Text style={[styles.ticketNo, ready && styles.readyText]}>#{String(ticket.number).padStart(3, '0')}</Text>
                </View>
                <View style={styles.stubDetails}>
                  <Text style={[styles.label, ready && styles.readyText]}>{ticket.name}</Text>
                  <Text style={[styles.description, ready && styles.readyText]}>{ticket.kind === 'table' ? `Table for ${ticket.size}` : 'Order pickup'}</Text>
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
          {!destination && <Button onDark onPress={() => { setStaff(true); setError(''); }}>Staff dashboard</Button>}
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
  top: {
    paddingHorizontal: 20, paddingVertical: 10, minHeight: 63, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'space-between',
  },
  brand: { color: colours.cream, fontFamily: headline, fontSize: 38, fontWeight: '800', letterSpacing: -1 },
  content: { padding: 17, gap: 15, width: '100%', maxWidth: 520, alignSelf: 'center' },
  card: { borderWidth: 1, borderColor: '#d2a0ab', borderRadius: 9, padding: 21, backgroundColor: colours.paper, gap: 13 },
  ready: { backgroundColor: colours.green, borderColor: '#5e9c7e' },
  readyRule: { borderColor: '#8bb79f' },
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
  queueNote: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 3, color: colours.ink, backgroundColor: colours.butter, fontWeight: '700' },
  stub: { flexDirection: 'row', gap: 15, borderTopWidth: 2, borderStyle: 'dashed', borderColor: '#96657d', paddingTop: 13, marginTop: 2 },
  stubNumber: { borderRightWidth: 1, borderColor: '#a26c83', paddingRight: 15 },
  stubDetails: { flex: 1, minWidth: 0, justifyContent: 'center' },
  ticketNo: { color: colours.ink, fontFamily: headline, fontSize: 37, fontWeight: '800', letterSpacing: -1 },
});
