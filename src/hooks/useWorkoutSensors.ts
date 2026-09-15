import {useEffect,useState} from 'react';
import {AppState,Platform} from 'react-native';
import * as Location from 'expo-location';
import {Pedometer} from 'expo-sensors';
import {useSafeScaleStore} from '../store/useSafeScaleStore';
import {appendWorkoutLocation} from '../services/WorkoutSensors';

/** Lives at the app root, so changing tabs never stops foreground recording. */
export function useWorkoutSensors(enabled: boolean): void {
  const id = useSafeScaleStore(state => state.activeWorkout?.id);
  const requested = useSafeScaleStore(state => state.activeWorkout?.recordSensors);
  const revision = useSafeScaleStore(state => state.dataRevision);
  const demo = useSafeScaleStore(state => state.isTestMode);
  const [foreground,setForeground] = useState(AppState.currentState === 'active');
  useEffect(() => {const sub=AppState.addEventListener('change',state=>setForeground(state==='active'));return()=>sub.remove();},[]);
  useEffect(() => {
    if (!enabled || !id || !requested || demo) return;
    const update = (change: Parameters<ReturnType<typeof useSafeScaleStore.getState>['updateLiveWorkout']>[0]) => {
      const state=useSafeScaleStore.getState();
      if (state.activeWorkout?.id===id && state.dataRevision===revision && !state.isDeletingData) state.updateLiveWorkout(change);
    };
    if (Platform.OS === 'web') {update({sensorStatus:'GPS and steps require the native app.'});return;}
    if (!foreground) {update({sensorStatus:'Sensors paused while the app is in the background. Timer continues.'});return;}
    update({sensorGapAt:Date.now()});
    let disposed=false;
    let gps: {remove():void} | undefined;
    let steps: {remove():void} | undefined;
    const baseSteps=useSafeScaleStore.getState().activeWorkout?.stepCount || 0;
    let gpsStatus='checking',stepsStatus='checking';
    const report=()=>{if(!disposed)update({sensorStatus:`GPS: ${gpsStatus} · Steps: ${stepsStatus}. Foreground recording only.`});};
    void (async()=>{
      try {
        const permission=await Location.requestForegroundPermissionsAsync();
        if (disposed) return;
        if (!permission.granted) {gpsStatus='permission denied';report();return;}
        const subscription=await Location.watchPositionAsync({accuracy:Location.Accuracy.High,timeInterval:5000,distanceInterval:5},position=>{
          if(disposed)return;
          const workout=useSafeScaleStore.getState().activeWorkout;
          if(workout?.id!==id)return;
          const change=appendWorkoutLocation(workout,{latitude:position.coords.latitude,longitude:position.coords.longitude,timestamp:position.timestamp},position.coords.accuracy);
          if(change)update(change);
        });
        if(disposed)subscription.remove();else {gps=subscription;gpsStatus='recording';report();}
      } catch {gpsStatus='unavailable';report();}
    })();
    void (async()=>{
      try {
        const permission=await Pedometer.requestPermissionsAsync();
        const available=permission.granted && await Pedometer.isAvailableAsync();
        if(disposed)return;
        if(!available){stepsStatus='unavailable or denied';report();return;}
        steps=Pedometer.watchStepCount(result=>{
          if(!disposed && Number.isFinite(result.steps) && result.steps>=0)update({stepCount:baseSteps+Math.floor(result.steps)});
        });
        stepsStatus='recording';report();
      } catch {stepsStatus='unavailable';report();}
    })();
    return()=>{disposed=true;gps?.remove();steps?.remove();};
  },[enabled,id,requested,foreground,revision,demo]);
}
