import Foundation
import HealthKit

enum SafeScaleWorkoutSync {
  static func save(id: String, type: String, startISO: String, endISO: String, calories: Double, distance: Double) async throws -> Bool {
    guard HKHealthStore.isHealthDataAvailable() else { return false }
    let store = HKHealthStore()
    guard store.authorizationStatus(for: HKObjectType.workoutType()) == .sharingAuthorized else { return false }
    let format = ISO8601DateFormatter()
    format.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    guard !id.isEmpty, id.count <= 200, let start = format.date(from: startISO), let end = format.date(from: endISO),
          end > start, end.timeIntervalSince(start) <= 7 * 86400,
          calories.isFinite, calories >= 0, distance.isFinite, distance >= 0 else {
      throw NSError(domain: "SafeScaleWorkout", code: 1, userInfo: [NSLocalizedDescriptionKey: "Invalid workout values."])
    }
    let types: [String: HKWorkoutActivityType] = ["Running": .running, "Walking": .walking, "Cycling": .cycling,
      "Strength": .traditionalStrengthTraining, "HIIT": .highIntensityIntervalTraining, "Yoga": .yoga]
    // HealthKit sync metadata identifies a logical workout across repeated saves.
    // This immutable local record always uses version 1, including retries after a timeout.
    let workout = HKWorkout(activityType: types[type] ?? .other, start: start, end: end,
      duration: end.timeIntervalSince(start), totalEnergyBurned: HKQuantity(unit: .kilocalorie(), doubleValue: calories),
      totalDistance: distance > 0 ? HKQuantity(unit: .meter(), doubleValue: distance) : nil,
      metadata: [HKMetadataKeySyncIdentifier: "safescale.workout." + id, HKMetadataKeySyncVersion: 1])
    return try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Bool, Error>) in
      store.save(workout) { success, error in
        if let error { continuation.resume(throwing: error) }
        else { continuation.resume(returning: success) }
      }
    }
  }
}
