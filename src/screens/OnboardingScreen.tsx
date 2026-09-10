import React, { useState } from 'react';
import { Text, View, Keyboard } from 'react-native';
import { useSafeScaleStore } from '../store/useSafeScaleStore';
import { localDate, validDate } from '../utils/daily';
import HealthConnections from '../components/care/HealthConnections';
import { Button, Card, Chips, Field, Heading, Page, s } from '../components/care/UI';
import type { ProfileSuggestion } from '../services/HealthSyncService';

export default function OnboardingScreen({ onDone }: { onDone: () => void }) {
  const initial = useSafeScaleStore.getState();
  const [step, setStep] = useState(0);
  const [name, setName] = useState(initial.profile.name);
  const [dob, setDob] = useState(initial.profile.dob);
  const [blood, setBlood] = useState(initial.profile.bloodType || 'Unknown');
  const [allergies, setAllergies] = useState(initial.userAllergies.join(', '));
  const [suggestion, setSuggestion] = useState<ProfileSuggestion>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  function next() {
    Keyboard.dismiss();
    if (step === 1 && dob && (!validDate(dob) || dob > localDate())) {
      setError('Use a real birth date in YYYY-MM-DD format, or leave it blank.'); return;
    }
    setError(''); setStep(step + 1);
  }
  function finish() {
    const store = useSafeScaleStore.getState();
    store.completeOnboarding({ ...store.profile, name: name.trim(), dob, bloodType: blood }, Array.from(new Set(allergies.split(',').map(value => value.trim()).filter(Boolean))));
    onDone();
  }
  return <Page key={step} title={['Connect your health apps', 'Your personal details', 'Ready for your daily care'][step]} subtitle={`Step ${step + 1} of 3 · You can update these choices in Settings.`}>
    {step === 0 ? <><Card><HealthConnections onProfile={setSuggestion} onBusyChange={setBusy} /></Card><Text style={s.body}>Connections are optional. Health data is read only after you choose a provider and approve access. Google sign-in may also return profile details for you to review.</Text><Button label="Continue" disabled={busy} onPress={next} /><Button label="Enter manually" secondary disabled={busy} onPress={next} /></> : null}
    {step === 1 ? <Card><Heading title="Review your profile" detail="All fields are optional. Only enter details you want to keep here." />
      {suggestion && (suggestion.name || suggestion.dob) ? <View style={{ gap: 8 }}><Text style={s.body}>Available from your health connection: {[suggestion.name, suggestion.dob].filter(Boolean).join(' · ')}</Text><Button label="Use imported details" secondary onPress={() => { if (suggestion.name) setName(suggestion.name); if (suggestion.dob && validDate(suggestion.dob)) setDob(suggestion.dob); }} /></View> : null}
      <Field label="What should we call you?" value={name} onChangeText={setName} maxLength={100} />
      <Field label="Date of birth (YYYY-MM-DD, optional)" value={dob} onChangeText={setDob} maxLength={10} />
      <Text style={s.label}>Blood type · leave Unknown unless confirmed</Text><Chips options={['Unknown', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']} value={blood} onChange={setBlood} />
      <Field label="Known allergies (comma-separated, optional)" value={allergies} onChangeText={setAllergies} multiline maxLength={1000} />
      {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}<Button label="Review setup" onPress={next} /><Button label="Back" secondary onPress={() => setStep(0)} />
    </Card> : null}
    {step === 2 ? <Card><Heading title="Your setup" /><Text style={s.body}>Name: {name.trim() || 'Not entered'}{'\n'}Birth date: {dob || 'Not entered'}{'\n'}Blood type: {blood}{'\n'}Allergies: {allergies.trim() || 'Not entered'}</Text><Text style={s.body}>Your profile, notes and connection information are saved on this device. Clearing app data removes them. SafeScale does not encrypt its local storage.</Text><Button label="Get started" onPress={finish} /><Button label="Back" secondary onPress={() => setStep(1)} /></Card> : null}
  </Page>;
}
