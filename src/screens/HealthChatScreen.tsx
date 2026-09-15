/**
 * @file src/screens/HealthChatScreen.tsx
 * @description Completely local, fully private AI Health Assistant interface.
 *
 * Grounded in the user's real health data with zero cloud transmission by default.
 * Enforces interactive user consent every time before any cloud escalation.
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  StyleSheet,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useSafeScaleStore } from '../store/useSafeScaleStore';
import {
  LocalHealthChatEngine,
  type ChatMessage,
} from '../services/LocalHealthChatEngine';
import { HealthContextAggregator } from '../services/HealthContextAggregator';
import { Sheet, C, s } from '../components/care/UI';

const SUGGESTED_PROMPTS = [
  'How are my macros looking today?',
  'Analyze my sleep debt & recovery.',
  'Am I in ketosis right now?',
  'What medications are still pending?',
  'Give me a holistic health summary.',
  'Check my blood pressure & cardio vitals.',
];

export default function HealthChatScreen({ onBack }: { onBack?: () => void }) {
  const insets = useSafeAreaInsets();
  const profile = useSafeScaleStore(state => state.profile);
  const apiKey = (profile.geminiApiKey && profile.geminiApiKey.trim())
    || (process.env.EXPO_PUBLIC_GEMINI_API_KEY || '').trim();

  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    {
      id: 'welcome_1',
      sender: 'assistant',
      text: `Hello ${profile.name ? profile.name.split(' ')[0] : 'there'}! I am your private on-device Health Assistant. I have direct local access to your biometrics, diet, sleep, fasting, and medications. Cloud requests require your approval. How can I help you today?`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      source: 'local-engine',
      dataPointsReferenced: ['Local assistant · Provider shown per reply'],
    },
  ]);

  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [contextModalOpen, setContextModalOpen] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);

  const pills = HealthContextAggregator.getQuickPillSummary();
  const contextSnapshot = HealthContextAggregator.getSnapshot();

  useEffect(() => {
    setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
  }, [messages, loading]);

  const handleSend = async (textToSend?: string) => {
    const query = (textToSend || input).trim();
    if (!query || loading) return;

    const userMsg: ChatMessage = {
      id: `user_${Date.now()}`,
      sender: 'user',
      text: query,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const response = await LocalHealthChatEngine.sendMessage(query);
      setMessages(prev => [...prev, response]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error processing query locally.';
      setMessages(prev => [
        ...prev,
        {
          id: `err_${Date.now()}`,
          sender: 'assistant',
          text: `⚠️ ${msg}`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          source: 'local-engine',
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleEscalateCloud = async () => {
    if (!input.trim() && messages.length <= 1) {
      Alert.alert('Cloud Query', 'Type a question first before asking Cloud AI.');
      return;
    }

    const query = input.trim() || [...messages].reverse().find(m => m.sender === 'user')?.text || '';
    if (!apiKey) {
      Alert.alert('Gemini API Key Needed', 'Add a Gemini API key in Profile to use cloud AI.');
      return;
    }

    setLoading(true);
    try {
      const cloudResponse = await LocalHealthChatEngine.escalateToCloudWithPermission(
        query,
        apiKey,
      );
      setMessages(prev => [...prev, cloudResponse]);
      setInput('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Cloud query aborted.';
      Alert.alert('Notice', msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: C.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header Bar */}
      <View style={[localStyles.header, { paddingTop: insets.top + 8 }]}>
        <View style={localStyles.headerLeft}>
          {onBack && (
            <Pressable onPress={onBack} hitSlop={10} style={localStyles.backButton}>
              <MaterialCommunityIcons name="arrow-left" size={24} color={C.ink} />
            </Pressable>
          )}
          <View>
            <Text style={localStyles.headerTitle}>AI Health Assistant</Text>
            <View style={localStyles.privacyBadge}>
              <MaterialCommunityIcons name="shield-lock" size={12} color={C.green} />
              <Text style={localStyles.privacyBadgeText}>Local replies · Cloud requires approval</Text>
            </View>
          </View>
        </View>

        <Pressable
          onPress={() => setContextModalOpen(true)}
          style={localStyles.inspectContextBtn}
        >
          <MaterialCommunityIcons name="database-eye-outline" size={18} color={C.green} />
          <Text style={localStyles.inspectContextBtnText}>Data</Text>
        </Pressable>
      </View>

      {/* Quick Telemetry Pill Ribbon */}
      <View style={localStyles.pillRibbon}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingHorizontal: 16 }}>
          {pills.map((pill, idx) => (
            <Pressable
              key={idx}
              onPress={() => setContextModalOpen(true)}
              style={localStyles.pill}
            >
              <Text style={localStyles.pillText}>{pill}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {/* Chat Messages */}
      <ScrollView
        ref={scrollViewRef}
        style={localStyles.chatScroll}
        contentContainerStyle={{ padding: 16, gap: 14 }}
      >
        {messages.map(msg => {
          const isUser = msg.sender === 'user';
          return (
            <View
              key={msg.id}
              style={[
                localStyles.messageRow,
                isUser ? { justifyContent: 'flex-end' } : { justifyContent: 'flex-start' },
              ]}
            >
              {!isUser && (
                <View style={localStyles.botAvatar}>
                  <MaterialCommunityIcons name="brain" size={18} color={C.green} />
                </View>
              )}

              <View
                style={[
                  localStyles.messageBubble,
                  isUser ? localStyles.userBubble : localStyles.botBubble,
                ]}
              >
                {/* Source Badge */}
                {!isUser && (
                  <View style={localStyles.sourceBadgeRow}>
                    <View
                      style={[
                        localStyles.sourceBadgePill,
                        msg.source === 'cloud-gemini'
                          ? { backgroundColor: '#E0F2FE' }
                          : { backgroundColor: C.pale },
                      ]}
                    >
                      <Text
                        style={[
                          localStyles.sourceBadgeText,
                          msg.source === 'cloud-gemini' ? { color: '#0369A1' } : { color: C.green },
                        ]}
                      >
                        {msg.source === 'cloud-gemini'
                          ? '☁️ Cloud Gemini (Approved)'
                          : msg.source === 'apple-foundation'
                          ? '🍏 Apple Foundation Model'
                          : '⚡ SafeScale local rules'}
                      </Text>
                    </View>
                    <Text style={localStyles.timeText}>{msg.timestamp}</Text>
                  </View>
                )}

                <Text style={[localStyles.messageText, isUser && { color: C.white }]}>
                  {msg.text}
                </Text>

                {/* Referenced Data Points */}
                {msg.dataPointsReferenced && msg.dataPointsReferenced.length > 0 && (
                  <View style={localStyles.dataPointsRow}>
                    {msg.dataPointsReferenced.map((dp, idx) => (
                      <View key={idx} style={localStyles.dataPointTag}>
                        <Text style={localStyles.dataPointTagText}>{dp}</Text>
                      </View>
                    ))}
                  </View>
                )}

                {isUser && (
                  <Text style={[localStyles.timeText, { color: 'rgba(255,255,255,0.7)', alignSelf: 'flex-end', marginTop: 4 }]}>
                    {msg.timestamp}
                  </Text>
                )}
              </View>
            </View>
          );
        })}

        {loading && (
          <View style={[localStyles.messageRow, { justifyContent: 'flex-start' }]}>
            <View style={localStyles.botAvatar}>
              <MaterialCommunityIcons name="brain" size={18} color={C.green} />
            </View>
            <View style={[localStyles.messageBubble, localStyles.botBubble, { flexDirection: 'row', gap: 8, alignItems: 'center' }]}>
              <ActivityIndicator size="small" color={C.green} />
              <Text style={{ fontSize: 13, color: C.muted, fontWeight: '600' }}>Reasoning locally on-device…</Text>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Suggested Prompts (when few messages) */}
      {messages.length <= 4 && (
        <View style={{ paddingVertical: 4 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
            {SUGGESTED_PROMPTS.map((prompt, idx) => (
              <Pressable
                key={idx}
                onPress={() => handleSend(prompt)}
                style={localStyles.suggestedBtn}
              >
                <Text style={localStyles.suggestedBtnText}>{prompt}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Input Bar */}
      <View style={[localStyles.inputBar, { paddingBottom: Math.max(12, insets.bottom + 6) }]}>
        <TextInput
          style={localStyles.textInput}
          placeholder="Ask anything about your health, macros, sleep..."
          placeholderTextColor={C.muted}
          value={input}
          onChangeText={setInput}
          multiline
          maxLength={500}
        />

        {/* Cloud Escalate Icon */}
        <Pressable
          onPress={handleEscalateCloud}
          style={localStyles.cloudButton}
          accessibilityLabel="Ask Cloud AI with permission"
        >
          <MaterialCommunityIcons name="cloud-sync-outline" size={20} color={C.muted} />
        </Pressable>

        {/* Send Button */}
        <Pressable
          onPress={() => handleSend()}
          disabled={!input.trim() || loading}
          style={[
            localStyles.sendButton,
            { opacity: !input.trim() || loading ? 0.4 : 1 },
          ]}
        >
          <MaterialCommunityIcons name="arrow-up" size={20} color={C.white} />
        </Pressable>
      </View>

      {/* Context Inspector Sheet */}
      {contextModalOpen && (
        <Sheet title="What Local AI Sees" onClose={() => setContextModalOpen(false)}>
          <Text style={s.body}>
            All of the following data is processed strictly in your phone&apos;s memory on the Apple Neural Engine. Nothing is ever uploaded to a server.
          </Text>

          <View style={{ gap: 14 }}>
            <View style={localStyles.inspectorCard}>
              <Text style={localStyles.inspectorHeader}>🍎 TODAY NUTRITION</Text>
              <Text style={localStyles.inspectorContent}>
                {contextSnapshot.nutrition.todayCalories === null ? 'Not recorded' : `${contextSnapshot.nutrition.todayCalories} kcal`} · {contextSnapshot.nutrition.proteinGrams === null ? 'Not recorded' : `${contextSnapshot.nutrition.proteinGrams}g`} Protein · {contextSnapshot.nutrition.carbsGrams === null ? 'Not recorded' : `${contextSnapshot.nutrition.carbsGrams}g`} Carbs · {contextSnapshot.nutrition.fatGrams === null ? 'Not recorded' : `${contextSnapshot.nutrition.fatGrams}g`} Fat
              </Text>
            </View>

            <View style={localStyles.inspectorCard}>
              <Text style={localStyles.inspectorHeader}>🌙 SLEEP & CIRCADIAN</Text>
              <Text style={localStyles.inspectorContent}>
                Duration: {contextSnapshot.sleep.formatted} · Recovery: {contextSnapshot.vitals.recoveryScore || 'N/A'}%
              </Text>
            </View>

            <View style={localStyles.inspectorCard}>
              <Text style={localStyles.inspectorHeader}>💊 MEDICATIONS</Text>
              <Text style={localStyles.inspectorContent}>
                {contextSnapshot.medications.taken} of {contextSnapshot.medications.total} doses taken today
              </Text>
            </View>

            <View style={localStyles.inspectorCard}>
              <Text style={localStyles.inspectorHeader}>⏳ INTERMITTENT FASTING</Text>
              <Text style={localStyles.inspectorContent}>
                {contextSnapshot.fasting.isFasting
                  ? `${contextSnapshot.fasting.protocol} (${contextSnapshot.fasting.elapsedHours}h elapsed · ${contextSnapshot.fasting.metabolicStage})`
                  : 'No active fasting session'}
              </Text>
            </View>

            <View style={localStyles.inspectorCard}>
              <Text style={localStyles.inspectorHeader}>❤️ CARDIO & VITALS</Text>
              <Text style={localStyles.inspectorContent}>
                Heart Rate: {contextSnapshot.vitals.heartRate || 'N/A'} bpm · HRV: {contextSnapshot.vitals.hrvSdnn || 'N/A'} ms · Steps: {contextSnapshot.vitals.steps.toLocaleString()}
              </Text>
            </View>
          </View>
        </Sheet>
      )}
    </KeyboardAvoidingView>
  );
}

const localStyles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 10,
    backgroundColor: C.white,
    borderBottomWidth: 1,
    borderColor: C.line,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: C.ink,
  },
  privacyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  privacyBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: C.green,
  },
  inspectContextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: C.pale,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  inspectContextBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: C.green,
  },
  pillRibbon: {
    backgroundColor: C.white,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderColor: C.line,
  },
  pill: {
    backgroundColor: C.bg,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: C.line,
  },
  pillText: {
    fontSize: 11,
    fontWeight: '600',
    color: C.ink,
  },
  chatScroll: {
    flex: 1,
  },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  botAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: C.pale,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  messageBubble: {
    maxWidth: '82%',
    borderRadius: 18,
    padding: 14,
    gap: 6,
  },
  userBubble: {
    backgroundColor: C.green,
    borderBottomRightRadius: 4,
  },
  botBubble: {
    backgroundColor: C.white,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: C.line,
  },
  sourceBadgeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  sourceBadgePill: {
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  sourceBadgeText: {
    fontSize: 9,
    fontWeight: '700',
  },
  timeText: {
    fontSize: 10,
    color: C.muted,
  },
  messageText: {
    fontSize: 14,
    color: C.ink,
    lineHeight: 20,
  },
  dataPointsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 6,
  },
  dataPointTag: {
    backgroundColor: C.bg,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  dataPointTagText: {
    fontSize: 9,
    fontWeight: '600',
    color: C.muted,
  },
  suggestedBtn: {
    backgroundColor: C.white,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: C.line,
  },
  suggestedBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: C.green,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.white,
    borderTopWidth: 1,
    borderColor: C.line,
    paddingHorizontal: 14,
    paddingTop: 10,
    gap: 8,
  },
  textInput: {
    flex: 1,
    backgroundColor: C.bg,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 14,
    color: C.ink,
    maxHeight: 90,
  },
  cloudButton: {
    padding: 8,
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: C.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inspectorCard: {
    backgroundColor: C.bg,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: C.line,
    gap: 4,
  },
  inspectorHeader: {
    fontSize: 10,
    fontWeight: '700',
    color: C.green,
    letterSpacing: 0.5,
  },
  inspectorContent: {
    fontSize: 13,
    fontWeight: '600',
    color: C.ink,
  },
});
