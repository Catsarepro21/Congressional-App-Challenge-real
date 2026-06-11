import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Alert,
  Linking,
  Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeScaleStore } from '../store/useSafeScaleStore';

const COLORS = {
  emergency: '#D63031',
  emergencyContainer: '#FFECEC',
  primary: '#227C54',
  background: '#F3F5F7',
  surface: '#FFFFFF',
  textPrimary: '#1A2129',
  textSecondary: '#6B7A87',
  border: 'hsl(220, 20%, 90%)',
  white: '#FFFFFF',
};

export const EmergencyScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  
  // Dynamic store data
  const profile = useSafeScaleStore((s) => s.profile);
  const allergies = useSafeScaleStore((s) => s.userAllergies) || [];
  const medicationSchedule = useSafeScaleStore((s) => s.medicationSchedule) || [];
  const emergencyContacts = useSafeScaleStore((s) => s.emergencyContacts) || [];

  // Local state
  const [isPrintView, setIsPrintView] = useState(false);
  const [showProtocolModal, setShowProtocolModal] = useState(false);
  
  // Pulser animation for the SOS indicator
  const pulseAnim = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0.3,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [pulseAnim]);

  // Calculate age
  const calculateAge = (dobString: string): number => {
    try {
      const birth = new Date(dobString);
      const today = new Date();
      let age = today.getFullYear() - birth.getFullYear();
      const m = today.getMonth() - birth.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
        age--;
      }
      return age;
    } catch {
      return 30; // fallback
    }
  };


  const handleCall911 = () => {
    Alert.alert(
      'Dial Emergency Services',
      'Are you sure you want to dial 911?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Call 911', style: 'destructive', onPress: () => Linking.openURL('tel:911') }
      ]
    );
  };

  const handleDialContact = (phone: string, name: string) => {
    Alert.alert(
      'Call Emergency Contact',
      `Dial ${name} at ${phone}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Call', onPress: () => Linking.openURL(`tel:${phone}`) }
      ]
    );
  };

  const activeMedications = medicationSchedule.filter(m => m.status !== 'Completed');

  // PRINT / WALLPAPER SCREENSHOT MODE RENDERING
  if (isPrintView) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.white, paddingTop: insets.top + 16, paddingHorizontal: 24 }}>
        {/* Compact, ultra-clean design for wallpaper screenshot */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <Text style={{ fontSize: 22, fontWeight: '900', color: COLORS.emergency }}>
            EMERGENCY MEDICAL ID
          </Text>
          <Pressable 
            onPress={() => setIsPrintView(false)}
            style={{ padding: 6, backgroundColor: '#F3F5F7', borderRadius: 8 }}
          >
            <Text style={{ fontSize: 11, fontWeight: '700', color: COLORS.textPrimary }}>Back</Text>
          </Pressable>
        </View>

        <View style={{ borderBottomWidth: 2, borderBottomColor: COLORS.emergency, paddingBottom: 12, marginBottom: 16 }}>
          <Text style={{ fontSize: 24, fontWeight: '800', color: COLORS.textPrimary }}>{profile.name}</Text>
          <Text style={{ fontSize: 13, color: COLORS.textSecondary, marginTop: 2 }}>
            DOB: {profile.dob} (Age {calculateAge(profile.dob)}) · Blood: {profile.bloodType} {profile.organDonor ? '· Organ Donor' : ''}
          </Text>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 40 }}>
          {/* Allergies - HIGHEST IMPORTANCE */}
          <View style={{ marginBottom: 20 }}>
            <Text style={{ fontSize: 13, fontWeight: '800', color: COLORS.emergency, textTransform: 'uppercase', marginBottom: 8 }}>
              ⚠️ Critical Allergies
            </Text>
            {allergies.length === 0 ? (
              <Text style={{ fontSize: 14, color: COLORS.textSecondary, fontStyle: 'italic' }}>No allergies configured.</Text>
            ) : (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {allergies.map((allergy: string) => (
                  <View key={allergy} style={{ backgroundColor: COLORS.emergencyContainer, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: COLORS.emergency }}>
                    <Text style={{ color: COLORS.emergency, fontWeight: '700', fontSize: 13 }}>{allergy}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* Active Medications */}
          <View style={{ marginBottom: 20 }}>
            <Text style={{ fontSize: 13, fontWeight: '800', color: COLORS.textPrimary, textTransform: 'uppercase', marginBottom: 8 }}>
              💊 Current Medications
            </Text>
            {medicationSchedule.length === 0 ? (
              <Text style={{ fontSize: 14, color: COLORS.textSecondary, fontStyle: 'italic' }}>No medications listed.</Text>
            ) : (
              medicationSchedule.map(med => (
                <View key={med.id} style={{ borderBottomWidth: 1, borderBottomColor: '#F3F5F7', paddingVertical: 8 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.textPrimary }}>{med.name} {med.dosage}</Text>
                  <Text style={{ fontSize: 12, color: COLORS.textSecondary, marginTop: 1 }}>Time: {med.time}</Text>
                </View>
              ))
            )}
          </View>

          {/* Emergency Contacts */}
          <View style={{ marginBottom: 20 }}>
            <Text style={{ fontSize: 13, fontWeight: '800', color: COLORS.textPrimary, textTransform: 'uppercase', marginBottom: 8 }}>
              📞 Emergency Contacts
            </Text>
            {emergencyContacts.length === 0 ? (
              <Text style={{ fontSize: 14, color: COLORS.textSecondary, fontStyle: 'italic' }}>No contacts configured.</Text>
            ) : (
              emergencyContacts.map(contact => (
                <View key={contact.id} style={{ borderBottomWidth: 1, borderBottomColor: '#F3F5F7', paddingVertical: 8 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.textPrimary }}>{contact.name}</Text>
                  <Text style={{ fontSize: 13, color: COLORS.textSecondary, marginTop: 1 }}>Phone: {contact.phone}</Text>
                </View>
              ))
            )}
          </View>

          {/* Instruction Footer */}
          <View style={{ backgroundColor: '#F3F5F7', borderRadius: 12, padding: 12, marginTop: 10 }}>
            <Text style={{ fontSize: 11, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 15 }}>
              Tip: Take a screenshot of this view to save as your lock screen wallpaper for quick access without unlocking.
            </Text>
          </View>
        </ScrollView>
      </View>
    );
  }

  // STANDARD INTERACTIVE EMERGENCY CARD VIEW
  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 16,
          paddingBottom: 40,
          paddingHorizontal: 20,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header with pulsing alert badge */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <View>
            <Text style={{ fontSize: 24, fontWeight: '800', color: COLORS.textPrimary }}>
              Emergency Medical ID
            </Text>
            <Text style={{ fontSize: 13, color: COLORS.textSecondary, marginTop: 4 }}>
              Offline-first medical data for emergency responders.
            </Text>
          </View>
          <Animated.View
            style={{
              width: 14,
              height: 14,
              borderRadius: 7,
              backgroundColor: COLORS.emergency,
              opacity: pulseAnim,
            }}
          />
        </View>

        {/* Primary Critical Actions Panel */}
        <View style={{ flexDirection: 'row', gap: 12, marginBottom: 20 }}>
          <Pressable
            onPress={handleCall911}
            style={({ pressed }) => ({
              flex: 1.2,
              backgroundColor: COLORS.emergency,
              borderRadius: 16,
              padding: 16,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.88 : 1,
              shadowColor: COLORS.emergency,
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.15,
              shadowRadius: 8,
              elevation: 4,
            })}
          >
            <MaterialCommunityIcons name="phone" size={24} color={COLORS.white} />
            <Text style={{ color: COLORS.white, fontWeight: '800', fontSize: 15, marginLeft: 8 }}>
              Call 911
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setShowProtocolModal(true)}
            style={({ pressed }) => ({
              flex: 1,
              backgroundColor: COLORS.emergencyContainer,
              borderRadius: 16,
              padding: 16,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 1,
              borderColor: COLORS.emergency,
              opacity: pressed ? 0.88 : 1,
            })}
          >
            <MaterialCommunityIcons name="medical-bag" size={22} color={COLORS.emergency} />
            <Text style={{ color: COLORS.emergency, fontWeight: '800', fontSize: 13, marginLeft: 6 }}>
              Allergy Protocol
            </Text>
          </Pressable>
        </View>

        {/* 1. Patient Demographics Profile Card */}
        <View
          style={{
            backgroundColor: COLORS.surface,
            borderRadius: 24,
            padding: 20,
            marginBottom: 20,
            shadowColor: '#1A2129',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.05,
            shadowRadius: 10,
            elevation: 2,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
            <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: COLORS.emergencyContainer, alignItems: 'center', justifyContent: 'center', marginRight: 16 }}>
              <MaterialCommunityIcons name="account-circle" size={32} color={COLORS.emergency} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 18, fontWeight: '800', color: COLORS.textPrimary }}>
                {profile.name}
              </Text>
              <Text style={{ fontSize: 12, color: COLORS.textSecondary, marginTop: 2 }}>
                Age {calculateAge(profile.dob)} · Born {profile.dob}
              </Text>
            </View>
            <View style={{ backgroundColor: COLORS.emergencyContainer, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 }}>
              <Text style={{ fontSize: 14, fontWeight: '900', color: COLORS.emergency }}>
                {profile.bloodType}
              </Text>
            </View>
          </View>

          <View style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 14, gap: 16 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 10, fontWeight: '800', color: COLORS.textSecondary, textTransform: 'uppercase' }}>
                Organ Donor
              </Text>
              <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.textPrimary, marginTop: 2 }}>
                {profile.organDonor ? 'Yes (Registered)' : 'No / Unspecified'}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 10, fontWeight: '800', color: COLORS.textSecondary, textTransform: 'uppercase' }}>
                Height & Weight
              </Text>
              <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.textPrimary, marginTop: 2 }}>
                {Math.round(profile.height)} cm · {Math.round(profile.weight)} kg
              </Text>
            </View>
          </View>
        </View>

        {/* 2. Critical Allergies Card */}
        <View
          style={{
            backgroundColor: COLORS.surface,
            borderRadius: 24,
            padding: 20,
            marginBottom: 20,
            shadowColor: '#1A2129',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.05,
            shadowRadius: 10,
            elevation: 2,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
            <MaterialCommunityIcons name="alert-decagram" size={20} color={COLORS.emergency} />
            <Text style={{ fontSize: 15, fontWeight: '800', color: COLORS.textPrimary, marginLeft: 8 }}>
              ⚠️ Severe Allergens List
            </Text>
          </View>

          {allergies.length === 0 ? (
            <Text style={{ fontSize: 12, color: COLORS.textSecondary, fontStyle: 'italic' }}>
              No critical allergens configured. Manage your profile under settings.
            </Text>
          ) : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {allergies.map((allergy: string) => (
                <View
                  key={allergy}
                  style={{
                    backgroundColor: COLORS.emergencyContainer,
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: COLORS.emergency,
                  }}
                >
                  <Text style={{ color: COLORS.emergency, fontWeight: '700', fontSize: 12 }}>
                    {allergy}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* 3. Active Medications Card */}
        <View
          style={{
            backgroundColor: COLORS.surface,
            borderRadius: 24,
            padding: 20,
            marginBottom: 20,
            shadowColor: '#1A2129',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.05,
            shadowRadius: 10,
            elevation: 2,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
            <MaterialCommunityIcons name="pill" size={20} color={COLORS.primary} />
            <Text style={{ fontSize: 15, fontWeight: '800', color: COLORS.textPrimary, marginLeft: 8 }}>
              Active Medications & Dosages
            </Text>
          </View>

          {activeMedications.length === 0 ? (
            <Text style={{ fontSize: 12, color: COLORS.textSecondary, fontStyle: 'italic' }}>
              No active medications scheduled for today.
            </Text>
          ) : (
            <View style={{ gap: 10 }}>
              {activeMedications.map((med) => (
                <View key={med.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F3F5F7' }}>
                  <View>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.textPrimary }}>
                      {med.name}
                    </Text>
                    <Text style={{ fontSize: 11, color: COLORS.textSecondary, marginTop: 1 }}>
                      Dosage: {med.dosage} · Today status: {med.status}
                    </Text>
                  </View>
                  <View style={{ backgroundColor: '#F3F5F7', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 }}>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: COLORS.textPrimary }}>
                      {med.time}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* 4. Emergency Contacts List */}
        <View
          style={{
            backgroundColor: COLORS.surface,
            borderRadius: 24,
            padding: 20,
            marginBottom: 20,
            shadowColor: '#1A2129',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.05,
            shadowRadius: 10,
            elevation: 2,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
            <MaterialCommunityIcons name="contacts" size={20} color={COLORS.primary} />
            <Text style={{ fontSize: 15, fontWeight: '800', color: COLORS.textPrimary, marginLeft: 8 }}>
              Emergency Contacts
            </Text>
          </View>

          {emergencyContacts.length === 0 ? (
            <Text style={{ fontSize: 12, color: COLORS.textSecondary, fontStyle: 'italic' }}>
              No emergency contacts added. You can configure them on the Home Dashboard.
            </Text>
          ) : (
            <View style={{ gap: 12 }}>
              {emergencyContacts.map((contact) => (
                <View key={contact.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.textPrimary }}>
                      {contact.name}
                    </Text>
                    <Text style={{ fontSize: 12, color: COLORS.textSecondary, marginTop: 1 }}>
                      {contact.phone}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => handleDialContact(contact.phone, contact.name)}
                    style={({ pressed }) => ({
                      width: 36,
                      height: 36,
                      borderRadius: 18,
                      backgroundColor: '#E8EDF0',
                      alignItems: 'center',
                      justifyContent: 'center',
                      opacity: pressed ? 0.7 : 1,
                    })}
                  >
                    <MaterialCommunityIcons name="phone" size={18} color={COLORS.textPrimary} />
                  </Pressable>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* 5. Wallpaper Export / Print Mode Button */}
        <Pressable
          onPress={() => setIsPrintView(true)}
          style={({ pressed }) => ({
            backgroundColor: COLORS.surface,
            borderWidth: 1.5,
            borderColor: COLORS.primary,
            borderRadius: 16,
            paddingVertical: 14,
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'row',
            opacity: pressed ? 0.88 : 1,
            marginBottom: 10,
          })}
        >
          <MaterialCommunityIcons name="wallpaper" size={20} color={COLORS.primary} />
          <Text style={{ color: COLORS.primary, fontWeight: '800', fontSize: 14, marginLeft: 8 }}>
            Export Wallpaper / Screenshot View
          </Text>
        </Pressable>
      </ScrollView>

      {/* EMERGENCY ALLERGY PROTOCOL MODAL */}
      {showProtocolModal && (
        <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 20, zIndex: 1000 }}>
          <View style={{ backgroundColor: COLORS.white, borderRadius: 24, padding: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
              <MaterialCommunityIcons name="ambulance" size={28} color={COLORS.emergency} />
              <Text style={{ fontSize: 18, fontWeight: '900', color: COLORS.emergency, marginLeft: 10 }}>
                Allergy Emergency Protocol
              </Text>
            </View>

            <ScrollView style={{ maxHeight: 300, marginBottom: 20 }}>
              <Text style={{ fontSize: 13, color: COLORS.textPrimary, lineHeight: 18, marginBottom: 12 }}>
                If you or the user is experiencing signs of severe allergic reaction (Anaphylaxis), follow these steps immediately:
              </Text>

              <View style={{ gap: 12 }}>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <Text style={{ fontWeight: '800', color: COLORS.emergency, fontSize: 14 }}>1.</Text>
                  <Text style={{ fontSize: 13, color: COLORS.textPrimary, flex: 1, lineHeight: 18 }}>
                    <Text style={{ fontWeight: '700' }}>Administer Epinephrine</Text>: Inject EpiPen or auto-injector into the outer thigh immediately. Hold for 3 seconds.
                  </Text>
                </View>

                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <Text style={{ fontWeight: '800', color: COLORS.emergency, fontSize: 14 }}>2.</Text>
                  <Text style={{ fontSize: 13, color: COLORS.textPrimary, flex: 1, lineHeight: 18 }}>
                    <Text style={{ fontWeight: '700' }}>Call 911</Text>: Phone local emergency services right away, even if epinephrine has already been administered.
                  </Text>
                </View>

                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <Text style={{ fontWeight: '800', color: COLORS.emergency, fontSize: 14 }}>3.</Text>
                  <Text style={{ fontSize: 13, color: COLORS.textPrimary, flex: 1, lineHeight: 18 }}>
                    <Text style={{ fontWeight: '700' }}>Position Safely</Text>: Have the person lie flat with legs raised. If breathing is difficult, sit up. Do NOT stand or walk.
                  </Text>
                </View>

                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <Text style={{ fontWeight: '800', color: COLORS.emergency, fontSize: 14 }}>4.</Text>
                  <Text style={{ fontSize: 13, color: COLORS.textPrimary, flex: 1, lineHeight: 18 }}>
                    <Text style={{ fontWeight: '700' }}>Repeat if Necessary</Text>: If symptoms do not improve after 5-15 minutes, administer a second dose of epinephrine if available.
                  </Text>
                </View>
              </View>
            </ScrollView>

            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Pressable
                onPress={() => {
                  setShowProtocolModal(false);
                  Linking.openURL('tel:911');
                }}
                style={{ flex: 1.2, backgroundColor: COLORS.emergency, borderRadius: 14, paddingVertical: 12, alignItems: 'center' }}
              >
                <Text style={{ color: COLORS.white, fontWeight: '800', fontSize: 13 }}>Call 911 Now</Text>
              </Pressable>

              <Pressable
                onPress={() => setShowProtocolModal(false)}
                style={{ flex: 1, backgroundColor: '#E8EDF0', borderRadius: 14, paddingVertical: 12, alignItems: 'center' }}
              >
                <Text style={{ color: COLORS.textPrimary, fontWeight: '700', fontSize: 13 }}>Close Guide</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}
    </View>
  );
};

export default EmergencyScreen;
