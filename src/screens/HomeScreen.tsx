import React, { useState } from 'react';
import { View, Text } from 'react-native';
import { useSafeScaleStore } from '../store/useSafeScaleStore';
import HealthConnections from '../components/care/HealthConnections';
import FoodNutritionModal from '../components/care/FoodNutritionModal';
import FoodSearchModal from '../components/care/FoodSearchModal';
import BarcodeScannerModal from '../components/care/BarcodeScannerModal';
import Medications from '../components/care/Medications';
import FastingTracker from '../components/care/FastingTracker';
import SleepArchitectureCard from '../components/care/SleepArchitectureCard';
import { Button, Card, Heading, Page, Sheet, C, s } from '../components/care/UI';
import { localDate } from '../utils/daily';
import { normalizeTodayCards, TODAY_CARDS, DEFAULT_TODAY_CARDS } from '../utils/timeline';
import { promptMealPhoto } from '../utils/mealPhotoPicker';
import { readingCaption } from '../utils/readingFreshness';
import type { TodayCardId } from '../types';

export default function HomeScreen({ onNavigate }: { onNavigate: (index: number) => void }) {
  const profile = useSafeScaleStore(state => state.profile);
  const updateProfile = useSafeScaleStore(state => state.updateProfile);
  const meds = useSafeScaleStore(state => state.medicationSchedule);
  const logs = useSafeScaleStore(state => state.moodLogs);
  const vitals = useSafeScaleStore(state => state.biometricCore);
  const lastSync = useSafeScaleStore(state => state.lastSyncedAt);
  const demo = useSafeScaleStore(state => state.isTestMode);
  const fasting = useSafeScaleStore(state => state.fastingSession.isFasting);
  const [connectionsOpen, setConnectionsOpen] = useState(false);
  const [customizing, setCustomizing] = useState(false);
  const [mealOpen, setMealOpen] = useState(false);
  const [foodPhotoUri, setFoodPhotoUri] = useState<string | null>(null);
  const [foodSearchOpen, setFoodSearchOpen] = useState(false);
  const [barcodeOpen, setBarcodeOpen] = useState(false);
  const cards = normalizeTodayCards(profile.todayCards);
  const taken = meds.filter(med => med.status === 'Completed').length;
  const nextMed = [...meds].filter(med => med.status !== 'Completed').sort((a, b) => a.time.localeCompare(b.time))[0];
  const checkedIn = logs.some(log => log.timestamp.slice(0, 10) === localDate());
  const save = (todayCards: TodayCardId[]) => updateProfile({ todayCards });
  const move = (id: TodayCardId, direction: number) => {
    const order = [...cards]; const from = order.indexOf(id); const to = from + direction;
    if (from < 0 || to < 0 || to >= order.length) return;
    [order[from], order[to]] = [order[to], order[from]]; save(order);
  };
  const renderCard = (id: TodayCardId) => {
    switch (id) {
      case 'medications': return <Medications />;
      case 'fasting': return <FastingTracker />;
      case 'sleep': return <SleepArchitectureCard />;
      case 'activity': return <Card><Heading title="Make room for movement" detail="View activity rings and record a workout." /><Button label="Open activity" icon="heart-pulse" secondary onPress={() => onNavigate(1)} /></Card>;
      case 'journal': return <Card><Heading title={checkedIn ? 'Your check-in is saved' : 'How are you feeling?'} detail="Capture symptoms, mood, and questions while they are fresh." /><View style={s.wrap}><Button label={checkedIn ? 'View journal' : 'Add a check-in'} secondary onPress={() => onNavigate(2)} /><Button label="View timeline" secondary onPress={() => onNavigate(9)} /></View></Card>;
      case 'readings': return <Card><Heading title="Latest health readings" detail={lastSync ? `Last sync ${new Date(lastSync).toLocaleString()}` : 'No sync yet. Connect Apple Health when you are ready.'} />
        <Text style={s.body}>Latest imported snapshot; individual readings may be older than the sync time.</Text>
        {(['heartRate','sleepMinutes','steps'] as const).map(key => {
          const labels = {heartRate:'Heart rate',sleepMinutes:'Sleep (minutes)',steps:'Steps'};
          const value = vitals[key];
          const known = !!vitals.readingMetadata?.[key] || value > 0;
          return <View key={key} style={{gap:4}}><View style={[s.row,{justifyContent:'space-between'}]}><Text style={s.body}>{labels[key]}</Text><Text style={s.heading}>{known ? Math.round(value).toLocaleString() : 'Not recorded'}</Text></View><Text style={s.body}>{readingCaption(vitals.readingMetadata?.[key])}</Text></View>;
        })}
        <Button label="Sync health readings" secondary icon="sync" onPress={() => setConnectionsOpen(true)} /></Card>;
    }
  };
  return <Page title={profile.name ? `Hello, ${profile.name.split(' ')[0]}.` : 'A little care, every day.'} subtitle={new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}>
    {demo ? <Text style={[s.label, { color: C.amber }]}>SAMPLE MODE · Showing fictional data</Text> : null}
    <View style={{ backgroundColor: C.ink, borderRadius: 25, padding: 24, gap: 16 }}>
      <Text style={{ color: '#A4D6BD', fontWeight: '700', letterSpacing: 1 }}>YOUR NEXT SMALL STEP</Text>
      <Text style={{ color: C.white, fontSize: 24, fontWeight: '600' }}>{nextMed && cards.includes('medications') ? `${nextMed.name} · ${nextMed.time}` : checkedIn ? 'Your day is taking shape.' : 'Take a moment to check in.'}</Text>
      <Text style={{ color: '#D2E2DB', fontSize: 15, lineHeight: 23 }}>{nextMed && cards.includes('medications') ? `${taken} of ${meds.length} daily doses recorded. Your schedule is below.` : 'Keep your routine and see your health records together.'}</Text>
      <View style={s.wrap}><Button label="View timeline" secondary onPress={() => onNavigate(9)} /><Button label="Add check-in" secondary onPress={() => onNavigate(2)} /></View>
    </View>
    <View style={s.wrap}><Button label="AI Health Assistant" secondary icon="brain" onPress={() => onNavigate(10)} /><Button label="Log meal" secondary onPress={() => setMealOpen(true)} /><Button label="Search food" secondary icon="magnify" onPress={() => setFoodSearchOpen(true)} /><Button label="Scan barcode" secondary icon="barcode-scan" onPress={() => setBarcodeOpen(true)} /><Button label="Snap meal photo" secondary icon="camera" onPress={() => promptMealPhoto(setFoodPhotoUri)} /><Button label="Medical ID" secondary icon="card-account-details-outline" onPress={() => onNavigate(8)} /><Button label="Customize Today" secondary icon="tune" onPress={() => setCustomizing(true)} /></View>
    {fasting && !cards.includes('fasting') ? <Card><Heading title="Your fasting timer is running" detail="Hiding the card does not stop your timer." /><Button label="Show fasting timer" secondary onPress={() => save([...cards, 'fasting'])} /></Card> : null}
    {cards.map(id => <View key={id}>{renderCard(id)}</View>)}
    {!cards.length ? <Card><Heading title="Make this space yours" detail="Choose the cards you want to see each day." /><Button label="Choose cards" onPress={() => setCustomizing(true)} /></Card> : null}
    {customizing ? <Sheet title="Customize Today" onClose={() => setCustomizing(false)}>
      <Text style={s.body}>Your visible cards appear first, in order. Changes save automatically. Hiding a card keeps its records and reminders.</Text>
      {[...cards, ...TODAY_CARDS.map(c => c.id).filter(id => !cards.includes(id))].map(id => <View key={id} style={{ gap: 10, paddingVertical: 14, borderBottomWidth: 1, borderColor: C.line }}>
        <Text style={s.heading}>{TODAY_CARDS.find(c => c.id === id)?.title}</Text>
        <View style={s.wrap}><Button label={`${cards.includes(id) ? 'Hide' : 'Show'} ${TODAY_CARDS.find(c => c.id === id)?.title}`} secondary onPress={() => save(cards.includes(id) ? cards.filter(c => c !== id) : [...cards, id])} />
          {cards.includes(id) ? <><Button label={`Move ${id} up`} secondary disabled={cards.indexOf(id) === 0} onPress={() => move(id, -1)} /><Button label={`Move ${id} down`} secondary disabled={cards.indexOf(id) === cards.length - 1} onPress={() => move(id, 1)} /></> : null}</View>
      </View>)}
      <Button label="Restore default layout" secondary onPress={() => save([...DEFAULT_TODAY_CARDS])} /><Button label="Done" onPress={() => setCustomizing(false)} />
    </Sheet> : null}
    {connectionsOpen ? <Sheet title="Health connections" onClose={() => setConnectionsOpen(false)}><HealthConnections /></Sheet> : null}
    <FoodNutritionModal visible={mealOpen || foodPhotoUri !== null} onClose={() => { setFoodPhotoUri(null); setMealOpen(false); }} photoUri={foodPhotoUri || undefined} />
    <FoodSearchModal visible={foodSearchOpen} onClose={() => setFoodSearchOpen(false)} />
    <BarcodeScannerModal visible={barcodeOpen} onClose={() => setBarcodeOpen(false)} />
  </Page>;
}
