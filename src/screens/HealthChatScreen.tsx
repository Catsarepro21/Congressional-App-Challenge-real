import { useChatStore } from '../store/useChatStore';
/**
 * @file src/screens/HealthChatScreen.tsx
 * @description Completely local, fully private AI Health Assistant interface.
 *
 * Grounded in the user's real health data with zero cloud transmission by default.
 * External AI requests are disabled in this build.
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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useSafeScaleStore } from '../store/useSafeScaleStore';
import {
  LocalHealthChatEngine,
  type ChatMessage,
} from '../services/LocalHealthChatEngine';
import { HealthContextAggregator } from '../services/HealthContextAggregator';
import { Button, Sheet, C, s } from '../components/care/UI';

useSafeScaleStore.subscribe((state, previous) => {
  if (state.isTestMode !== previous.isTestMode || state.dataRevision !== previous.dataRevision) useChatStore.getState().setMessages([]);
});

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

  const preference = useSafeScaleStore(state => state.aiPreference);
  const messages = useChatStore(state => state.messages);
  const setMessages = useChatStore(state => state.setMessages);
  const activeRequest = useRef<AbortController | null>(null);
  const [lastError, setLastError] = useState('');
  const lastQuery = useRef<{query:string} | null>(null);
  useEffect(() => () => {activeRequest.current?.abort(); activeRequest.current = null;}, []);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [contextModalOpen, setContextModalOpen] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);

  const pills = HealthContextAggregator.getQuickPillSummary();
  const contextSnapshot = HealthContextAggregator.getSnapshot();

  useEffect(() => {
    const timer = setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
    return () => clearTimeout(timer);
  }, [messages, loading]);

  const run = async (query: string, retry = false) => {
    query = query.trim();
    if (!query || activeRequest.current) return;
    const controller = new AbortController(); activeRequest.current = controller;
    const history = [...messages];
    lastQuery.current = {query}; setLastError('');
    if (!retry) setMessages(old => [...old,{id:`user_${Date.now()}`,sender:'user',text:query,timestamp:new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}]);
    setInput(''); setLoading(true);
    try {
      const options = {history,signal:controller.signal,allowNative:preference !== 'opt-out'};
      const response = await LocalHealthChatEngine.sendMessage(query,options);
      if (!controller.signal.aborted) setMessages(old => [...old,response]);
    } catch (error) {
      if (!controller.signal.aborted) setLastError(error instanceof Error ? error.message : 'The request failed. Please retry.');
    } finally {
      if (activeRequest.current === controller) {activeRequest.current = null;setLoading(false);}
    }
  };
  const handleSend = (text?: string) => run(text || input);
  const cancel = () => {activeRequest.current?.abort();activeRequest.current = null;setLoading(false);setLastError('Request canceled.');};

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
              <Text style={localStyles.privacyBadgeText}>Local processing · Cloud disabled</Text>
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
                          : '⚡ Healthfolio local rules'}
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
              <Text style={{ fontSize: 13, color: C.muted, fontWeight: '600' }}>{preference === 'opt-out' ? 'Checking your recorded data…' : 'Preparing a local reply…'}</Text>
            </View>
          </View>
        )}
      </ScrollView>

      <View style={{paddingHorizontal:16,gap:8}}>
        {!messages.length ? <Text style={s.body}>Ask about your recorded data. Conversation history stays in memory until the app closes. Model answers may be incomplete; check the original records.</Text> : null}
        {lastError ? <Text accessibilityRole="alert" style={s.body}>{lastError}</Text> : null}
        <View style={{flexDirection:'row',gap:12}}>
          {loading ? <Button label="Cancel reply" secondary onPress={cancel} /> : lastError && lastQuery.current ? <Button label="Retry" secondary onPress={() => {const last=lastQuery.current!;void run(last.query,true);}} /> : null}
          {messages.length ? <Button label="Clear conversation" secondary onPress={() => {cancel();setMessages([]);setLastError('');lastQuery.current=null;}} /> : null}
        </View>
      </View>
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
          accessibilityLabel="Health question"
          placeholder="Ask anything about your health, macros, sleep..."
          placeholderTextColor={C.muted}
          value={input}
          onChangeText={setInput}
          multiline
          maxLength={500}
        />

        {/* Send Button */}
        <Pressable
          accessibilityLabel="Send local question"
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
            This is the health snapshot available to the assistant on this device. Cloud requests are disabled.
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
