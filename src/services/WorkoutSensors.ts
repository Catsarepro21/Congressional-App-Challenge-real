import type {WorkoutSession, WorkoutCoordinate} from '../types';

export function appendWorkoutLocation(workout: WorkoutSession, point: WorkoutCoordinate, accuracy: number | null): Partial<WorkoutSession> | null {
  if (![point.latitude,point.longitude,point.timestamp].every(Number.isFinite) || Math.abs(point.latitude)>90 || Math.abs(point.longitude)>180 || accuracy === null || !Number.isFinite(accuracy) || accuracy < 0 || accuracy > 50) return null;
  const route = workout.routeCoordinates || [];
  const previous = route[route.length-1];
  let distance = 0;
  if (previous) {
    const seconds = (point.timestamp-previous.timestamp)/1000;
    if (seconds <= 0) return null;
    const rad = Math.PI/180;
    const a = Math.sin((point.latitude-previous.latitude)*rad/2)**2 + Math.cos(previous.latitude*rad)*Math.cos(point.latitude*rad)*Math.sin((point.longitude-previous.longitude)*rad/2)**2;
    distance = 6371000*2*Math.asin(Math.sqrt(Math.min(1,a)));
    // Do not draw distance across screen-lock gaps or implausible GPS jumps.
    if (seconds > 60 || previous.timestamp < (workout.sensorGapAt || 0)) distance = 0;
    else if (distance / seconds > 35) return null;
  }
  return {routeCoordinates:[...route,point].slice(-10000),distanceMeters:(workout.distanceMeters || 0)+distance};
}
