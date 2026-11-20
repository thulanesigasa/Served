import React, { useRef, useState } from 'react';
import {
  ActivityIndicator, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { request } from './served';

const welcome = [
  ['Scan. Join. Relax.', 'Scan the QR code at your table to open the restaurant’s menu.'],
  ['Your phone is your ticket.', 'Select your food, pay securely and follow your live order ticket.'],
  ['We’ll call you when it’s time.', 'Keep the app open to get an alert when your waiter is on the way.'],
];

export function Entry({ ready, onWelcome, onSession }) {
  const [step, setStep] = useState(0);
  const [mode, setMode] = useState('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const signup = mode === 'signup';
  const emailInput = useRef(null);
  const passwordInput = useRef(null);
  const confirmationInput = useRef(null);

  async function submit() {
    if (busy) return;
    if (signup && password !== confirmation) {
      setError('Your passwords must match.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const session = await request('guests/' + mode, { name, email, password });
      await onSession(session);
    } catch (problem) {
      setError(problem.message);
    } finally {
      setBusy(false);
    }
  }

  function changeMode() {
    setMode(signup ? 'login' : 'signup');
    setPassword('');
    setConfirmation('');
    setVisible(false);
    setError('');
  }

  return <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.screen}>
      <Image source={require('../assets/splash.png')} accessibilityLabel="Served" resizeMode="contain" style={styles.brand} />
      {!ready ? <View style={styles.paper}>
        <Text style={styles.label}>Welcome {step + 1} of 3</Text>
        <Text accessibilityRole="header" style={styles.title}>{welcome[step][0]}</Text>
        <Text style={styles.body}>{welcome[step][1]}</Text>
        <View style={styles.rule} />
        <Pressable accessibilityRole="button" style={styles.cta} onPress={step < 2 ? () => setStep(step + 1) : onWelcome}>
          <Text style={styles.ctaText}>{step < 2 ? 'Continue' : 'Get started'}</Text>
        </Pressable>
        {step > 0 && <Pressable accessibilityRole="button" style={styles.textButton} onPress={() => setStep(step - 1)}>
          <Text style={styles.link}>Previous</Text>
        </Pressable>}
      </View> : <View style={styles.paper}>
        <Text accessibilityRole="header" style={styles.title}>{signup ? 'Create your account' : 'Sign in'}</Text>
        {signup && <>
          <Text style={styles.label}>Name</Text>
          <TextInput accessibilityLabel="Name" value={name} onChangeText={setName} autoComplete="name"
            maxLength={45} style={styles.input} returnKeyType="next" submitBehavior="submit"
            onSubmitEditing={() => emailInput.current?.focus()} editable={!busy} />
        </>}
        <Text style={styles.label}>Email</Text>
        <TextInput ref={emailInput} accessibilityLabel="Email" value={email} onChangeText={setEmail} autoComplete="email"
          keyboardType="email-address" autoCapitalize="none" autoCorrect={false} maxLength={254}
          style={styles.input} returnKeyType="next" submitBehavior="submit"
          onSubmitEditing={() => passwordInput.current?.focus()} editable={!busy} />
        <View style={styles.passwordLabel}>
          <Text style={styles.label}>Password</Text>
          <Pressable accessibilityRole="button" disabled={busy} onPress={() => setVisible(!visible)}>
            <Text style={styles.link}>{visible ? 'Hide' : 'Show'}</Text>
          </Pressable>
        </View>
        <TextInput ref={passwordInput} accessibilityLabel="Password" value={password} onChangeText={setPassword}
          autoComplete={signup ? 'new-password' : 'current-password'} secureTextEntry={!visible}
          autoCapitalize="none" autoCorrect={false} maxLength={128} style={styles.input}
          returnKeyType={signup ? 'next' : 'go'} submitBehavior={signup ? 'submit' : 'blurAndSubmit'}
          onSubmitEditing={signup ? () => confirmationInput.current?.focus() : submit} editable={!busy} />
        {signup && <>
          <Text style={styles.body}>At least 8 characters, a number and a symbol.</Text>
          <Text style={styles.label}>Confirm password</Text>
          <TextInput ref={confirmationInput} accessibilityLabel="Confirm password" value={confirmation} onChangeText={setConfirmation}
            autoComplete="new-password" secureTextEntry={!visible} autoCapitalize="none" autoCorrect={false}
            maxLength={128} style={styles.input} returnKeyType="go" onSubmitEditing={submit} editable={!busy} />
        </>}
        {!!error && <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text>}
        <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy }} style={styles.cta}
          disabled={busy} onPress={submit}>
          {busy ? <ActivityIndicator color="#fff4e4" accessibilityLabel="Working" />
            : <Text style={styles.ctaText}>{signup ? 'Create account' : 'Sign in'}</Text>}
        </Pressable>
        <Pressable accessibilityRole="button" style={styles.textButton} disabled={busy} onPress={changeMode}>
          <Text style={styles.link}>{signup ? 'Already registered? Sign in' : 'New to Served? Create an account'}</Text>
        </Pressable>
      </View>}
    </ScrollView>
  </KeyboardAvoidingView>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { padding: 18, paddingTop: 25, gap: 22, width: '100%', maxWidth: 520, alignSelf: 'center' },
  brand: { width: 84, height: 43 },
  paper: { backgroundColor: '#f7cdd0', padding: 21, borderRadius: 9, gap: 11 },
  title: { color: '#321e32', fontSize: 38, lineHeight: 42, letterSpacing: -1.2, fontWeight: '900' },
  body: { color: '#57364f', fontSize: 15, lineHeight: 22 },
  label: { color: '#321e32', fontSize: 15, fontWeight: '700' },
  passwordLabel: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  input: { minHeight: 46, padding: 11, borderColor: '#99697f', borderWidth: 1, borderRadius: 5, color: '#321e32', backgroundColor: '#ffe2e3', fontSize: 16 },
  rule: { borderTopWidth: 1, borderColor: '#99697f', borderStyle: 'dashed', marginTop: 10 },
  cta: { minHeight: 46, justifyContent: 'center', alignItems: 'center', borderRadius: 6, backgroundColor: '#3b2540', marginTop: 4 },
  ctaText: { color: '#fff4e4', fontSize: 16, fontWeight: '800' },
  textButton: { paddingVertical: 9, alignItems: 'center' },
  link: { color: '#57364f', textDecorationLine: 'underline', fontWeight: '700', fontSize: 15 },
  error: { color: '#821d35', fontSize: 15, lineHeight: 21 },
});
