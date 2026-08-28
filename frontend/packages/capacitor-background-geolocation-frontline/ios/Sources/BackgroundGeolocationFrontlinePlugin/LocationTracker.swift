import Foundation
import CoreLocation

protocol LocationTrackerDelegate: AnyObject {
    func locationTracker(_ tracker: LocationTracker, didEmit point: CLLocation)
    func locationTracker(_ tracker: LocationTracker, didFailWithError error: Error)
    func locationTracker(_ tracker: LocationTracker, didChangeAuthorization status: CLAuthorizationStatus)
}

/// Wraps CLLocationManager for continuous background tracking of a cleanup route.
///
/// CLLocationManager has no native "every N seconds" delivery mode — it streams
/// updates continuously, so this class throttles emission itself by comparing
/// timestamps inside the delegate callback (not a separate Timer, to avoid races
/// between a timer fire and an in-flight delegate call).
final class LocationTracker: NSObject, CLLocationManagerDelegate {
    weak var delegate: LocationTrackerDelegate?

    private let manager = CLLocationManager()
    private var intervalSeconds: TimeInterval = 10
    private var lastEmittedAt: Date?
    private var isTracking = false

    var authorizationStatus: CLAuthorizationStatus {
        manager.authorizationStatus
    }

    override init() {
        super.init()
        manager.delegate = self
    }

    func requestWhenInUseAuthorization() {
        manager.requestWhenInUseAuthorization()
    }

    func requestAlwaysAuthorization() {
        manager.requestAlwaysAuthorization()
    }

    func start(intervalSeconds: TimeInterval, desiredAccuracyMeters: Double?) {
        self.intervalSeconds = intervalSeconds
        self.lastEmittedAt = nil
        self.isTracking = true

        manager.desiredAccuracy = desiredAccuracyMeters ?? kCLLocationAccuracyBest
        manager.distanceFilter = kCLDistanceFilterNone
        manager.allowsBackgroundLocationUpdates = true
        manager.pausesLocationUpdatesAutomatically = false
        manager.showsBackgroundLocationIndicator = true
        manager.startUpdatingLocation()
    }

    func stop() {
        isTracking = false
        manager.stopUpdatingLocation()
        manager.allowsBackgroundLocationUpdates = false
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard isTracking, let loc = locations.last else { return }

        let now = Date()
        if let last = lastEmittedAt, now.timeIntervalSince(last) < intervalSeconds {
            return
        }
        lastEmittedAt = now
        delegate?.locationTracker(self, didEmit: loc)
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        delegate?.locationTracker(self, didFailWithError: error)
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        delegate?.locationTracker(self, didChangeAuthorization: manager.authorizationStatus)
    }
}
