import React, { useEffect, useRef, useState } from 'react';
import { Alert, Platform, Text, View, Switch } from 'react-native';
import { useSafeScaleStore } from '../../store/useSafeScaleStore';
import { HEALTH_SOURCE_NAMES, syncHealthSource, cancelGoogleHealthSync, type ProfileSuggestion } from '../../services/HealthSyncService';
import { HealthDataService } from '../../services/HealthDataService';
import { classifyHRV } from '../../services/CardioDiagnosticsService';
import type { HealthSource } from '../../types';
import { Button, Heading, s, C } from './UI';

export default function HealthConnections({ onProfile, onBusyChange }: { onProfile?: (profile: ProfileSuggestion) => void; onBusyChange?: (busy: boolean) => void }) {
  const profile = useSafeScaleStore(state => state.profile);
  const connections = profile.healthConnections;
  const setAutoSyncEnabled = useSafeScaleStore(state => state.setAutoSyncEnabled);
  const demo = useSafeScaleStore(state => state.isTestMode);
  const [busy, setBusy] = useState<HealthSource | null>(null);
  const [message, setMessage] = useState('');
  const lock = useRef(false); const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const sources: HealthSource[] = Platform.OS === 'android' ? ['health-connect', 'apple', 'google-health'] : ['apple', 'google-health', 'health-connect'];
  async function connect(source: HealthSource, reconnect = false, confirmed = false) {
    if (lock.current || demo) return;
    if (source === 'google-health' && !confirmed && (reconnect || connections?.[source]?.consentVersion !== 1)) {
      Alert.alert('Connect Google Health / Fitbit?', 'Google will handle sign-in and permission approval. Healthfolio downloads your permitted readings from Google. Your Healthfolio journal, photos, chats and medical records are not uploaded. Imported readings and connection tokens are encrypted on this iPhone.', [
        {text:'Cancel', style:'cancel'}, {text:'Connect', onPress:() => {void connect(source,reconnect,true);}},
      ]); return;
    }
    lock.current = true; setBusy(source); onBusyChange?.(true); setMessage('');
    const revision = useSafeScaleStore.getState().dataRevision;
    try {
      const p = useSafeScaleStore.getState().profile;
      const result = await syncHealthSource(source, reconnect ? undefined : p.healthConnections?.[source], p.googleOAuthClientId, true);
      if (!mounted.current || useSafeScaleStore.getState().isTestMode || useSafeScaleStore.getState().dataRevision !== revision) return;
      if (!result) { setMessage('Sign-in cancelled. Your saved information has been kept.'); return; }
      const current = useSafeScaleStore.getState();
      const profileUpdates: any = {
        healthConnections: { ...current.profile.healthConnections, [source]: result.connection },
        ...(result.readings ? { lastHealthSource: source } : {}),
      };
      const importedFields: string[] = [];
      if (result.profile) {
        if (result.profile.dob && (!current.profile.dob || current.profile.dob === '')) {
          profileUpdates.dob = result.profile.dob;
          importedFields.push('Date of Birth');
        }
        if (result.profile.bloodType && (!current.profile.bloodType || current.profile.bloodType === 'Unknown')) {
          profileUpdates.bloodType = result.profile.bloodType;
          importedFields.push('Blood Type');
        }
        if (result.profile.height && !current.profile.height) {
          profileUpdates.height = result.profile.height;
          importedFields.push('Height');
        }
        if (result.profile.weight && !current.profile.weight) {
          profileUpdates.weight = result.profile.weight;
          importedFields.push('Weight');
        }
        if (result.profile.name && (!current.profile.name || current.profile.name === '')) {
          profileUpdates.name = result.profile.name;
          importedFields.push('Name');
        }
        onProfile?.(result.profile);
      }
      current.updateProfile(profileUpdates);
      if (result.readings) {
        current.updateBiometrics(result.readings);
        useSafeScaleStore.setState({ lastSyncedAt: result.connection.lastSyncedAt });
      }
      if (result.activityRings) {
        current.setActivityRings(result.activityRings);
      }
      if (result.sleepStages) {
        current.updateSleepStages(result.sleepStages);
      }
      if (typeof result.hrvMs === 'number' && result.hrvMs > 0) {
        const diag = classifyHRV(result.hrvMs);
        current.updateHRVMetrics({ ...diag, lastSyncedAt: new Date().toISOString() });
      }
      let statusMsg = result.readings
        ? `${HEALTH_SOURCE_NAMES[source]} readings updated!`
        : `${HEALTH_SOURCE_NAMES[source]} connected!`;
      if (importedFields.length > 0) {
        statusMsg += `\n\nImported: ${importedFields.join(', ')}.`;
      }
      setMessage(statusMsg);
      Alert.alert(`${HEALTH_SOURCE_NAMES[source]} Status`, statusMsg);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'The provider could not complete the sync.';
      if (mounted.current) {
        setMessage(errMsg);
        Alert.alert(`${HEALTH_SOURCE_NAMES[source]} Error`, errMsg);
      }
    } finally { lock.current = false; if (mounted.current) { setBusy(null); onBusyChange?.(false); } }
  }
  function checkHealthKit() {
    const diag = HealthDataService.getHealthKitDiagnostics();
    const lines = [
      `Platform: ${Platform.OS}`,
      `HealthKit Bridge: ${diag.available ? 'Connected' : 'Not detected'}`,
      `Native Module: ${diag.hasNativeBridge ? 'Found' : 'Missing'}`,
      `Permission Keys: ${diag.permissionKeysCount} available`,
      diag.reason ? `Note: ${diag.reason}` : '',
      '\nIf you do not see the permissions prompt, open:\niPhone Settings → Privacy & Security → Health → Healthfolio',
    ].filter(Boolean).join('\n');
    Alert.alert('Apple Health Diagnostics', lines);
  }
  function disconnect(source: HealthSource) {
    Alert.alert(`Disconnect ${HEALTH_SOURCE_NAMES[source]}?`, 'Saved readings stay on your device. To revoke permissions too, use Apple Health or your Google account settings.', [
      { text: 'Cancel', style: 'cancel' }, { text: 'Disconnect', onPress: () => {
        if (source === 'google-health') cancelGoogleHealthSync();
        const state = useSafeScaleStore.getState(); const next = { ...state.profile.healthConnections }; delete next[source];
        state.updateProfile({ healthConnections: next, ...(state.profile.lastHealthSource === source ? {lastHealthSource:undefined} : {}) }); setMessage(`${HEALTH_SOURCE_NAMES[source]} disconnected from Healthfolio.`);
      } },
    ]);
  }
  return <View style={{ gap: 16 }}>
    <Heading title="Connect your health apps" detail="Choose a source to import your available readings. You can connect now or come back later." />
    {demo ? <Text style={s.body}>Exit sample mode in Settings to connect your own accounts.</Text> : null}
    {sources.map(source => {
      const supported = source === 'apple' ? Platform.OS === 'ios' : source === 'health-connect' ? Platform.OS === 'android' : Platform.OS === 'ios';
      const connection = connections?.[source];
      return <View key={source} style={{ gap: 9, borderTopWidth: 1, borderColor: C.line, paddingTop: 14 }}>
        <Text style={s.label}>{HEALTH_SOURCE_NAMES[source]}{source === 'google-fit' ? ' · Legacy API' : ''}</Text>
        <Text style={s.body}>{!supported ? source === 'health-connect' ? 'Available in the Android app.' : 'Available in the iPhone app.' : connection?.lastSyncedAt ? `Last synced ${new Date(connection.lastSyncedAt).toLocaleString()}` : connection ? 'Connected · No readings imported yet' : source === 'google-health' ? 'Import Fitbit and other readings linked to your Google Health account. Read-only access; no journal, photo, chat or medical-record uploads.' : 'You choose which health information Healthfolio can read.'}</Text>
        {connection?.wearable?.detected ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#E8F5E9', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, alignSelf: 'flex-start' }}>
            <Text style={{ fontSize: 13 }}>⌚</Text>
            <Text style={{ fontSize: 12, fontWeight: '600', color: '#1B5E20' }}>
              {connection.wearable.name} detected · Contributing health metrics
            </Text>
          </View>
        ) : null}
        <View style={s.wrap}>
          <Button label={busy === source ? `Connecting ${HEALTH_SOURCE_NAMES[source]}…` : `${connection ? 'Sync' : 'Connect'} ${HEALTH_SOURCE_NAMES[source]}`} disabled={!!busy || demo || !supported} secondary onPress={() => connect(source)} />
          {source === 'apple' && Platform.OS === 'ios' ? (
            <Button label="Check Apple Health status" secondary onPress={checkHealthKit} />
          ) : null}
          {connection && supported ? <><Button label={`Disconnect ${HEALTH_SOURCE_NAMES[source]}`} disabled={!!busy || demo} secondary onPress={() => disconnect(source)} />{source.startsWith('google-') ? <Button label={`Reconnect ${HEALTH_SOURCE_NAMES[source]}`} disabled={!!busy || demo} secondary onPress={() => connect(source, true)} /> : null}</> : null}
        </View>
      </View>;
    })}
    <View style={{ borderTopWidth: 1, borderColor: C.line, paddingTop: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
      <View style={{ flex: 1, paddingRight: 16 }}>
        <Text style={s.label}>Automatic health sync</Text>
        <Text style={s.body}>Sync metrics automatically in the background when the app is active (every 15 min).</Text>
      </View>
      <Switch
        value={profile.autoSyncEnabled !== false}
        onValueChange={(val) => setAutoSyncEnabled(val)}
        trackColor={{ false: C.line, true: C.green }}
      />
    </View>
    {message ? <Text accessibilityLiveRegion="polite" style={s.body}>{message}</Text> : null}
  </View>;
}
