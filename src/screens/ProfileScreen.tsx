import PrivacySettings from '../components/care/PrivacySettings';
import React, { useState, useEffect } from 'react';
import { View, Text, Alert, Linking, Pressable, StyleSheet } from 'react-native';
import { useSafeScaleStore } from '../store/useSafeScaleStore';
import { validDate, localDate } from '../utils/daily';
import HealthConnections from '../components/care/HealthConnections';
import AIProviderSelector from '../components/care/AIProviderSelector';
import { AIIntelligenceService, getDeviceCapabilities, refreshDeviceCapabilities } from '../services/AIIntelligenceService';
import { getSuggestedOwnerName } from '../utils/deviceName';
import {
  Button,
  Card,
  Chips,
  Field,
  Heading,
  Icon,
  Page,
  Sheet,
  C,
  s,
} from '../components/care/UI';

const bloodTypes = [
  'Unknown',
  'A+',
  'A-',
  'B+',
  'B-',
  'AB+',
  'AB-',
  'O+',
  'O-',
];

export default function ProfileScreen() {
  const profile = useSafeScaleStore((state) => state.profile);
  const allergies = useSafeScaleStore((state) => state.userAllergies);
  const contacts = useSafeScaleStore((state) => state.emergencyContacts);
  const meds = useSafeScaleStore((state) => state.medicationSchedule);
  const demo = useSafeScaleStore((state) => state.isTestMode);
  const toggleTest = useSafeScaleStore((state) => state.toggleTestMode);
  const aiPreference = useSafeScaleStore((state) => state.aiPreference);
  const setAIPreference = useSafeScaleStore((state) => state.setAIPreference);

  // Form states
  const [name, setName] = useState(profile.name);
  const [dob, setDob] = useState(profile.dob);
  const [blood, setBlood] = useState(profile.bloodType || 'Unknown');
  const [heightCm, setHeightCm] = useState(profile.height ? String(profile.height) : '');
  const [weightKg, setWeightKg] = useState(profile.weight ? String(profile.weight) : '');

  useEffect(() => {
    setName(profile.name);
    setDob(profile.dob);
    setBlood(profile.bloodType || 'Unknown');
    setHeightCm(profile.height ? String(profile.height) : '');
    setWeightKg(profile.weight ? String(profile.weight) : '');
  }, [profile.name, profile.dob, profile.bloodType, profile.height, profile.weight]);

  const [allergyInput, setAllergyInput] = useState('');
  const [contactFormOpen, setContactFormOpen] = useState(false);
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  // Local AI Benchmark
  const [localAiTesting, setLocalAiTesting] = useState(false);
  const [localAiResult, setLocalAiResult] = useState<{
    runtime: string;
    latencyMs: number;
    summary: string;
    flagged: string[];
    supported: boolean;
  } | null>(null);

  const handleAutoDetectName = () => {
    const suggested = getSuggestedOwnerName();
    if (suggested) {
      setName(suggested);
      useSafeScaleStore.getState().updateProfile({
        name: suggested,
        deviceNameSuggestedName: suggested,
      });
      Alert.alert('Name Auto-Detected', `Found owner name: "${suggested}" from your device hostname.`);
    } else {
      Alert.alert(
        'Auto-Detect Name',
        'Could not automatically determine owner name from device hostname. You can type your name directly into the field below.'
      );
    }
  };

  const handleSaveProfile = () => {
    setMessage('');
    setError('');
    if (dob && (!validDate(dob) || dob > localDate())) {
      setError('Use a valid birth date in YYYY-MM-DD format, or leave it blank.');
      return;
    }

    const h = parseFloat(heightCm) || 0;
    const w = parseFloat(weightKg) || 0;

    useSafeScaleStore.getState().updateProfile({
      name: name.trim(),
      dob: dob.trim(),
      bloodType: blood,
      height: h,
      weight: w,
    });

    setMessage('Profile updated successfully.');
  };

  const handleAddAllergy = () => {
    if (!allergyInput.trim()) return;
    useSafeScaleStore.getState().addAllergy(allergyInput.trim());
    setAllergyInput('');
  };

  const handleAddContact = () => {
    if (!contactName.trim() || !contactPhone.trim()) return;
    useSafeScaleStore.getState().addEmergencyContact({
      name: contactName.trim(),
      phone: contactPhone.trim(),
    });
    setContactName('');
    setContactPhone('');
    setContactFormOpen(false);
  };

  const handleCall = async (phone: string) => {
    try {
      await Linking.openURL(`tel:${phone.replace(/[^+\d]/g, '')}`);
    } catch {
      Alert.alert('Could not open phone app', `Call ${phone} using your phone keypad.`);
    }
  };

  const handleTestLocalAI = async () => {
    setLocalAiTesting(true);
    try {
      const caps = await refreshDeviceCapabilities();
      const testIngredients = ['Wheat flour', 'Skim milk powder', 'Soy lecithin', 'Cane sugar', 'Cocoa butter'];
      const startTime = Date.now();
      const result = await AIIntelligenceService.analyzeIngredients(
        'on-device',
        testIngredients,
        allergies.length > 0 ? allergies : ['Milk', 'Soy'],
        'Sample Wafer'
      );
      const elapsed = Date.now() - startTime;
      const flagged = result.insights
        .filter((i) => i.category === 'Allergen')
        .map((i) => i.name);
      const report = {
        runtime: 'Offline ingredient checker',
        latencyMs: elapsed,
        summary: result.summary,
        flagged,
        supported: caps.isOnDeviceSupported,
      };
      setLocalAiResult(report);
      Alert.alert(
        '🧠 Local AI Benchmark Result',
        `Engine: ${report.runtime}\nExecution: 100% On-Device (Zero network bytes)\nLatency: ${report.latencyMs} ms\nResult: ${report.summary}\nDetected Allergens: ${report.flagged.join(', ') || 'None'}`
      );
    } catch (err: any) {
      Alert.alert('Local AI Error', err?.message || 'Inference failed.');
    } finally {
      setLocalAiTesting(false);
    }
  };

  return (
    <Page
      title="Profile & Medical ID"
      subtitle="Identity, emergency details, health syncing & device settings"
    >
      {demo && (
        <Text style={[s.label, { color: C.amber }]}>
          SAMPLE MODE · Showing fictional personal information
        </Text>
      )}

      {/* MEDICAL ID CARD PREVIEW */}
      <View style={styles.medicalCard}>
        <View style={s.row}>
          <Text style={styles.cardEyebrow}>PERSONAL MEDICAL ID</Text>
          <Icon name="card-account-details-outline" size={24} color="#A4D6BD" />
        </View>

        <Text style={styles.cardName}>{profile.name || 'Name not entered'}</Text>

        <View style={styles.cardDetailsGrid}>
          <View style={styles.cardDetailCol}>
            <Text style={styles.cardDetailLabel}>DATE OF BIRTH</Text>
            <Text style={styles.cardDetailValue}>{profile.dob || 'Not entered'}</Text>
          </View>
          <View style={styles.cardDetailCol}>
            <Text style={styles.cardDetailLabel}>BLOOD TYPE</Text>
            <Text style={styles.cardDetailValue}>{profile.bloodType || 'Unknown'}</Text>
          </View>
          <View style={styles.cardDetailCol}>
            <Text style={styles.cardDetailLabel}>HEIGHT / WEIGHT</Text>
            <Text style={styles.cardDetailValue}>
              {profile.height ? `${profile.height} cm` : '--'} · {profile.weight ? `${profile.weight} kg` : '--'}
            </Text>
          </View>
        </View>

        {allergies.length > 0 && (
          <View style={{ marginTop: 4 }}>
            <Text style={styles.cardDetailLabel}>ALLERGIES</Text>
            <Text style={[styles.cardDetailValue, { color: '#FFEBEA' }]}>
              {allergies.join(', ')}
            </Text>
          </View>
        )}

        {contacts.length > 0 && (
          <View style={[s.row, { marginTop: 8 }]}>
            <Text style={[styles.cardDetailLabel, { flex: 1 }]}>PRIMARY EMERGENCY CONTACT</Text>
            <Button
              label={`Call ${contacts[0].name.split(' ')[0]}`}
              icon="phone"
              secondary
              onPress={() => handleCall(contacts[0].phone)}
            />
          </View>
        )}
      </View>

      {/* PERSONAL DETAILS & AUTO-NAME DETECTION */}
      <Card>
        <View style={s.row}>
          <Icon name="account-edit-outline" size={24} color={C.green} />
          <Heading
            title="Personal Baseline"
            detail="Your personal baseline is used for personalized MET calorie burn calculations and medical identification."
          />
        </View>

        <View style={{ gap: 12 }}>
          <View style={{ gap: 6 }}>
            <View style={s.row}>
              <Text style={[s.label, { flex: 1 }]}>Full Name</Text>
              <Button
                label="Auto-detect from Device"
                secondary
                icon="cellphone-check"
                onPress={handleAutoDetectName}
              />
            </View>
            <Field
              label=""
              placeholder="e.g. Rehan"
              value={name}
              onChangeText={setName}
            />
          </View>

          <Field
            label="Date of Birth (YYYY-MM-DD)"
            placeholder="e.g. 1995-04-12"
            value={dob}
            onChangeText={setDob}
          />

          <View style={{ gap: 6 }}>
            <Text style={s.label}>Blood Type</Text>
            <Chips options={bloodTypes} value={blood} onChange={setBlood} />
          </View>

          <View style={s.row}>
            <View style={{ flex: 1 }}>
              <Field
                label="Height (cm)"
                keyboardType="numeric"
                placeholder="175"
                value={heightCm}
                onChangeText={setHeightCm}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Field
                label="Weight (kg)"
                keyboardType="numeric"
                placeholder="70"
                value={weightKg}
                onChangeText={setWeightKg}
              />
            </View>
          </View>

          {error ? <Text style={s.error}>{error}</Text> : null}
          {message ? <Text style={{ color: C.green, fontSize: 13, fontWeight: '700' }}>{message}</Text> : null}

          <View style={{ alignSelf: 'flex-start', marginTop: 6 }}>
            <Button label="Save Changes" icon="check" onPress={handleSaveProfile} />
          </View>
        </View>
      </Card>

      {/* EMERGENCY CONTACTS */}
      <Card>
        <View style={s.row}>
          <Icon name="phone-alert-outline" size={24} color={C.red} />
          <Heading
            title="Emergency Contacts"
            detail="Contacts displayed on your Medical ID who can be called directly in an emergency."
          />
        </View>

        {contacts.length > 0 ? (
          <View style={{ gap: 10 }}>
            {contacts.map((contact) => (
              <View key={contact.id} style={styles.contactRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.contactName}>{contact.name}</Text>
                  <Text style={styles.contactPhone}>{contact.phone}</Text>
                </View>
                <Button
                  label="Call"
                  icon="phone"
                  secondary
                  onPress={() => handleCall(contact.phone)}
                />
                <Pressable
                  accessibilityLabel="Remove contact"
                  onPress={() => useSafeScaleStore.getState().removeEmergencyContact(contact.id)}
                  style={{ padding: 8 }}
                >
                  <Icon name="close" color={C.muted} size={18} />
                </Pressable>
              </View>
            ))}
          </View>
        ) : (
          <Text style={s.body}>No emergency contacts added yet.</Text>
        )}

        <View style={{ alignSelf: 'flex-start' }}>
          <Button
            label="+ Add Emergency Contact"
            secondary
            onPress={() => setContactFormOpen(true)}
          />
        </View>
      </Card>

      {/* TRACKED ALLERGIES */}
      <Card>
        <View style={s.row}>
          <Icon name="shield-alert-outline" size={24} color={C.amber} />
          <Heading
            title="Tracked Allergens"
            detail="Ingredients flagged in nutrition labels, meals, and food scans."
          />
        </View>

        {allergies.length > 0 ? (
          <View style={s.wrap}>
            {allergies.map((item) => (
              <Pressable
                key={item}
                onPress={() => useSafeScaleStore.getState().removeAllergy(item)}
                style={styles.allergyTag}
              >
                <Text style={styles.allergyText}>{item}</Text>
                <Icon name="close" size={14} color={C.red} />
              </Pressable>
            ))}
          </View>
        ) : (
          <Text style={s.body}>No allergies tracked.</Text>
        )}

        <View style={s.row}>
          <View style={{ flex: 1 }}>
            <Field
              label=""
              placeholder="e.g. Peanut, Gluten, Dairy"
              value={allergyInput}
              onChangeText={setAllergyInput}
            />
          </View>
          <Button label="Add" secondary onPress={handleAddAllergy} />
        </View>
      </Card>

      {/* HEALTH CONNECTIONS (Apple Health & Google Health) */}
      <Card>
        <View style={s.row}>
          <Icon name="sync" size={24} color={C.green} />
          <Heading
            title="Health & Wearable Connections"
            detail="Two-way sync with Apple Health, Apple Watch, and Google Health"
          />
        </View>
        <HealthConnections />
      </Card>

      <PrivacySettings />

      {/* AI ENGINE & ON-DEVICE BENCHMARK */}
      <Card>
        <View style={s.row}>
          <Icon name="brain" size={24} color={C.green} />
          <Heading
            title="Intelligence & Models"
            detail="Configure food vision, allergen checking, and on-device privacy models"
          />
        </View>
        <AIProviderSelector
          value={aiPreference}
          onChange={setAIPreference}
          showHeading={false}
        />

        <View style={[styles.aiBenchmarkCard, { marginTop: 12 }]}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={styles.aiBenchmarkTitle}>Local AI Benchmark</Text>
            <Text style={styles.aiBenchmarkSubtitle}>
              Test the offline ingredient checker. This does not benchmark native model generation.
            </Text>
          </View>
          <Button
            label={localAiTesting ? 'Testing…' : '🧪 Run Benchmark'}
            secondary
            disabled={localAiTesting}
            onPress={handleTestLocalAI}
          />
        </View>

        {localAiResult && (
          <View style={styles.aiResultBox}>
            <Text style={styles.aiResultTitle}>Latest Test: {localAiResult.runtime}</Text>
            <Text style={styles.aiResultMeta}>Latency: {localAiResult.latencyMs} ms · Local: 100%</Text>
            <Text style={styles.aiResultSummary}>{localAiResult.summary}</Text>
          </View>
        )}
      </Card>

      {/* SAMPLE MODE & RESTART */}
      <Card>
        <Heading
          title="App Simulation & Sample Data"
          detail="Toggle realistic sample data for testing without live health sensors."
        />
        <View style={s.wrap}>
          <Button
            label={demo ? 'Exit Sample Mode' : 'Enter Sample Mode'}
            secondary
            onPress={toggleTest}
          />
        </View>
      </Card>

      {/* ADD CONTACT MODAL */}
      {contactFormOpen && (
        <Sheet title="Add Emergency Contact" onClose={() => setContactFormOpen(false)}>
          <Field
            label="Contact Name"
            placeholder="e.g. Dr. Jane Smith or Mom"
            value={contactName}
            onChangeText={setContactName}
          />
          <Field
            label="Phone Number"
            keyboardType="phone-pad"
            placeholder="e.g. (555) 123-4567"
            value={contactPhone}
            onChangeText={setContactPhone}
          />
          <View style={[s.row, { justifyContent: 'flex-end', marginTop: 10 }]}>
            <Button label="Cancel" secondary onPress={() => setContactFormOpen(false)} />
            <Button label="Add Contact" icon="check" onPress={handleAddContact} />
          </View>
        </Sheet>
      )}
    </Page>
  );
}

const styles = StyleSheet.create({
  medicalCard: {
    backgroundColor: C.ink,
    borderRadius: 24,
    padding: 24,
    gap: 14,
  },
  cardEyebrow: {
    color: '#A4D6BD',
    fontSize: 11,
    letterSpacing: 2,
    fontWeight: '800',
    flex: 1,
  },
  cardName: {
    color: C.white,
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  cardDetailsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.12)',
  },
  cardDetailCol: {
    minWidth: 110,
    gap: 2,
  },
  cardDetailLabel: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.1,
    color: '#A4D6BD',
  },
  cardDetailValue: {
    fontSize: 14,
    color: C.white,
    fontWeight: '600',
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
    gap: 10,
  },
  contactName: {
    fontSize: 15,
    fontWeight: '700',
    color: C.ink,
  },
  contactPhone: {
    fontSize: 13,
    color: C.muted,
  },
  allergyTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#FFEBEA',
    borderWidth: 1,
    borderColor: '#F8C8C6',
  },
  allergyText: {
    fontSize: 13,
    fontWeight: '700',
    color: C.red,
  },
  aiBenchmarkCard: {
    backgroundColor: C.pale,
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  aiBenchmarkTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: C.green,
  },
  aiBenchmarkSubtitle: {
    fontSize: 12,
    color: C.muted,
    lineHeight: 16,
  },
  aiResultBox: {
    backgroundColor: C.bg,
    borderRadius: 12,
    padding: 12,
    gap: 4,
    marginTop: 8,
  },
  aiResultTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: C.ink,
  },
  aiResultMeta: {
    fontSize: 11,
    fontWeight: '600',
    color: C.green,
  },
  aiResultSummary: {
    fontSize: 12,
    color: C.muted,
  },
});
