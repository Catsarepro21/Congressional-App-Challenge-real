import React, { useState } from 'react';
import { Text, View, Keyboard } from 'react-native';
import { useSafeScaleStore } from '../store/useSafeScaleStore';
import { localDate, validDate } from '../utils/daily';
import HealthConnections from '../components/care/HealthConnections';
import AIProviderSelector from '../components/care/AIProviderSelector';
import { Button, Card, Chips, Field, Heading, Page, s } from '../components/care/UI';
import { AIIntelligenceService } from '../services/AIIntelligenceService';
import type { ProfileSuggestion } from '../services/HealthSyncService';
import type { AIIntelligenceProvider } from '../types';

const STEP_TITLES = [
  'Connect your health apps',
  'Intelligence & privacy',
  'Your personal details',
  'Ready for your daily care',
];

export default function OnboardingScreen({ onDone }: { onDone: () => void }) {
  const initial = useSafeScaleStore.getState();
  const [step, setStep] = useState(0);
  const [name, setName] = useState(initial.profile.name);
  const [dob, setDob] = useState(initial.profile.dob);
  const [blood, setBlood] = useState(initial.profile.bloodType || 'Unknown');
  const [allergies, setAllergies] = useState(initial.userAllergies.join(', '));
  const [aiPref, setAiPref] = useState<AIIntelligenceProvider>(initial.aiPreference || 'opt-out');
  const [suggestion, setSuggestion] = useState<ProfileSuggestion>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  function next() {
    Keyboard.dismiss();
    if (step === 2 && dob && (!validDate(dob) || dob > localDate())) {
      setError('Use a real birth date in YYYY-MM-DD format, or leave it blank.'); return;
    }
    setError(''); setStep(step + 1);
  }
  function finish() {
    const store = useSafeScaleStore.getState();
    store.completeOnboarding({ ...store.profile, name: name.trim(), dob, bloodType: blood }, Array.from(new Set(allergies.split(',').map(value => value.trim()).filter(Boolean))), aiPref);
    onDone();
  }
  return <Page key={step} title={STEP_TITLES[step]} subtitle={`Step ${step + 1} of ${STEP_TITLES.length} · You can update these choices in Settings.`}>
    {step === 0 ? <><Card><HealthConnections onProfile={setSuggestion} onBusyChange={setBusy} /></Card><Text style={s.body}>Connections are optional. Apple Health and Health Connect read on-device data. Google Health / Fitbit imports download permitted readings from Google after you sign in. Journal records, photos and chats are not uploaded.</Text><Button label="Continue" disabled={busy} onPress={next} /><Button label="Enter manually" secondary disabled={busy} onPress={next} /></> : null}
    {step === 1 ? <><Card><AIProviderSelector value={aiPref} onChange={setAiPref} /></Card><Button label="Continue" onPress={next} /><Button label="Back" secondary onPress={() => setStep(0)} /></> : null}
    {step === 2 ? <Card><Heading title="Review your profile" detail="All fields are optional. Only enter details you want to keep here." />
      {suggestion && (suggestion.name || suggestion.dob) ? <View style={{ gap: 8 }}><Text style={s.body}>Available from your health connection: {[suggestion.name, suggestion.dob].filter(Boolean).join(' · ')}</Text><Button label="Use imported details" secondary onPress={() => { if (suggestion.name) setName(suggestion.name); if (suggestion.dob && validDate(suggestion.dob)) setDob(suggestion.dob); }} /></View> : null}
      <Field label="What should we call you?" value={name} onChangeText={setName} maxLength={100} />
      <Field label="Date of birth (YYYY-MM-DD, optional)" value={dob} onChangeText={setDob} maxLength={10} />
      <Text style={s.label}>Blood type · leave Unknown unless confirmed</Text><Chips options={['Unknown', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']} value={blood} onChange={setBlood} />
      <Field label="Known allergies (comma-separated, optional)" value={allergies} onChangeText={setAllergies} multiline maxLength={1000} />
      {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}<Button label="Review setup" onPress={next} /><Button label="Back" secondary onPress={() => setStep(1)} />
    </Card> : null}
    {step === 3 ? <Card><Heading title="Your setup" /><Text style={s.body}>Name: {name.trim() || 'Not entered'}{'\n'}Birth date: {dob || 'Not entered'}{'\n'}Blood type: {blood}{'\n'}Allergies: {allergies.trim() || 'Not entered'}{'\n'}AI Engine: {AIIntelligenceService.providerLabel(aiPref)}</Text><Text style={s.body}>Your profile and notes are encrypted on this device. AI runs locally. Optional Google Health / Fitbit import uses read-only Google requests. Browser records require your vault passphrase; native records use a device secure-storage key.</Text><Button label="Get started" onPress={finish} /><Button label="Back" secondary onPress={() => setStep(2)} /></Card> : null}
  </Page>;
}
