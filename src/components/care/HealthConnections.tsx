import React, { useEffect, useRef, useState } from 'react';
import { Alert, Platform, Text, View } from 'react-native';
import { useSafeScaleStore } from '../../store/useSafeScaleStore';
import { HEALTH_SOURCE_NAMES, syncHealthSource, type ProfileSuggestion } from '../../services/HealthSyncService';
import type { HealthSource } from '../../types';
import { Button, Heading, s, C } from './UI';

export default function HealthConnections({ onProfile, onBusyChange }: { onProfile?: (profile: ProfileSuggestion) => void; onBusyChange?: (busy: boolean) => void }) {
  const connections = useSafeScaleStore(state => state.profile.healthConnections);
  const demo = useSafeScaleStore(state => state.isTestMode);
  const [busy, setBusy] = useState<HealthSource | null>(null);
  const [message, setMessage] = useState('');
  const lock = useRef(false); const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const sources: HealthSource[] = Platform.OS === 'android' ? ['health-connect', 'google-health', 'google-fit', 'apple'] : ['apple', 'google-health', 'google-fit', 'health-connect'];
  async function connect(source: HealthSource, reconnect = false) {
    if (lock.current || demo) return;
    lock.current = true; setBusy(source); onBusyChange?.(true); setMessage('');
    try {
      const profile = useSafeScaleStore.getState().profile;
      const result = await syncHealthSource(source, reconnect ? undefined : profile.healthConnections?.[source], profile.googleOAuthClientId, !!onProfile);
      if (!mounted.current || useSafeScaleStore.getState().isTestMode) return;
      if (!result) { setMessage('Sign-in cancelled. Your saved information has been kept.'); return; }
      const current = useSafeScaleStore.getState();
      current.updateProfile({ healthConnections: { ...current.profile.healthConnections, [source]: result.connection }, ...(result.readings ? { lastHealthSource: source } : {}) });
      if (result.readings) {
        current.updateBiometrics(result.readings);
        useSafeScaleStore.setState({ lastSyncedAt: result.connection.lastSyncedAt });
      }
      if (result.profile) onProfile?.(result.profile);
      setMessage(result.readings ? `${HEALTH_SOURCE_NAMES[source]} readings updated.` : `${HEALTH_SOURCE_NAMES[source]} connected, but no readable samples were returned. Check the selected permissions and available data. Existing readings have been kept.`);
    } catch (error) {
      if (mounted.current) setMessage(error instanceof Error && !/token exchange|token refresh|API error/.test(error.message) ? error.message : 'The provider could not complete the sync. Check access for this account and try reconnecting.');
    } finally { lock.current = false; if (mounted.current) { setBusy(null); onBusyChange?.(false); } }
  }
  function disconnect(source: HealthSource) {
    Alert.alert(`Disconnect ${HEALTH_SOURCE_NAMES[source]}?`, 'Saved readings stay on your device. To revoke permissions too, use Apple Health or your Google account settings.', [
      { text: 'Cancel', style: 'cancel' }, { text: 'Disconnect', onPress: () => {
        const state = useSafeScaleStore.getState(); const next = { ...state.profile.healthConnections }; delete next[source];
        state.updateProfile({ healthConnections: next }); setMessage(`${HEALTH_SOURCE_NAMES[source]} disconnected from SafeScale.`);
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
        <Text style={s.body}>{!supported ? source === 'health-connect' ? 'Available in the Android app.' : 'Available in the iPhone app.' : connection?.lastSyncedAt ? `Last synced ${new Date(connection.lastSyncedAt).toLocaleString()}` : connection ? 'Connected · No readings imported yet' : source === 'google-fit' ? 'For accounts and projects that still have Google Fit API access.' : source === 'google-health' ? 'Sign in to import data available to your Google Health account.' : 'You choose which health information SafeScale can read.'}</Text>
        <View style={s.wrap}>
          <Button label={busy === source ? `Connecting ${HEALTH_SOURCE_NAMES[source]}…` : `${connection ? 'Sync' : 'Connect'} ${HEALTH_SOURCE_NAMES[source]}`} disabled={!!busy || demo || !supported} secondary onPress={() => connect(source)} />
          {connection && supported ? <><Button label={`Disconnect ${HEALTH_SOURCE_NAMES[source]}`} disabled={!!busy || demo} secondary onPress={() => disconnect(source)} />{source.startsWith('google-') ? <Button label={`Reconnect ${HEALTH_SOURCE_NAMES[source]}`} disabled={!!busy || demo} secondary onPress={() => connect(source, true)} /> : null}</> : null}
        </View>
      </View>;
    })}
    {message ? <Text accessibilityLiveRegion="polite" style={s.body}>{message}</Text> : null}
  </View>;
}
