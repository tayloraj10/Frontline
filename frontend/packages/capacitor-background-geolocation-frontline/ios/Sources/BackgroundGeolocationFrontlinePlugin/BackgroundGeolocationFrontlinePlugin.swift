import Foundation
import UIKit
import Capacitor
import CoreLocation

@objc(BackgroundGeolocationFrontlinePlugin)
public class BackgroundGeolocationFrontlinePlugin: CAPPlugin, CAPBridgedPlugin, LocationTrackerDelegate {
    public let identifier = "BackgroundGeolocationFrontlinePlugin"
    public let jsName = "BackgroundGeolocationFrontline"
    public let pluginMethods: [CAPPluginMethod] = [
        .init(name: "checkPermissions", returnType: CAPPluginReturnPromise),
        .init(name: "requestWhenInUsePermission", returnType: CAPPluginReturnPromise),
        .init(name: "requestAlwaysPermission", returnType: CAPPluginReturnPromise),
        .init(name: "start", returnType: CAPPluginReturnPromise),
        .init(name: "stop", returnType: CAPPluginReturnPromise),
        .init(name: "openSettings", returnType: CAPPluginReturnPromise)
    ]

    private let tracker = LocationTracker()

    // Pending permission-request calls, resolved from the delegate's
    // didChangeAuthorization callback rather than synchronously, since
    // CLLocationManager's request*Authorization methods are async.
    private var pendingWhenInUseCall: CAPPluginCall?
    private var pendingAlwaysCall: CAPPluginCall?

    override public func load() {
        tracker.delegate = self
    }

    @objc override public func checkPermissions(_ call: CAPPluginCall) {
        call.resolve(["location": permissionState(for: tracker.authorizationStatus).rawValue])
    }

    @objc func requestWhenInUsePermission(_ call: CAPPluginCall) {
        let status = tracker.authorizationStatus
        if status != .notDetermined {
            call.resolve(["location": whenInUseResult(for: status)])
            return
        }
        pendingWhenInUseCall = call
        tracker.requestWhenInUseAuthorization()
    }

    @objc func requestAlwaysPermission(_ call: CAPPluginCall) {
        let status = tracker.authorizationStatus
        if status == .authorizedAlways {
            call.resolve(["location": "granted"])
            return
        }
        guard status == .authorizedWhenInUse else {
            // Always can only be requested as an in-session upgrade from When-In-Use.
            call.resolve(["location": permissionState(for: status).rawValue])
            return
        }
        pendingAlwaysCall = call
        tracker.requestAlwaysAuthorization()
    }

    @objc func start(_ call: CAPPluginCall) {
        guard tracker.authorizationStatus == .authorizedAlways else {
            call.reject("Always location permission is required to start background route tracking.")
            return
        }
        let intervalSeconds = call.getDouble("intervalSeconds") ?? 10
        let desiredAccuracyMeters = call.getDouble("desiredAccuracyMeters")
        tracker.start(intervalSeconds: intervalSeconds, desiredAccuracyMeters: desiredAccuracyMeters)
        call.resolve(["started": true])
    }

    @objc func stop(_ call: CAPPluginCall) {
        tracker.stop()
        call.resolve()
    }

    @objc func openSettings(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let url = URL(string: UIApplication.openSettingsURLString) else {
                call.reject("Could not construct settings URL.")
                return
            }
            UIApplication.shared.open(url, options: [:]) { _ in
                call.resolve()
            }
        }
    }

    // MARK: - CLLocationManagerDelegate (via LocationTracker)

    func locationTracker(_ tracker: LocationTracker, didEmit point: CLLocation) {
        notifyListeners("location", data: [
            "latitude": point.coordinate.latitude,
            "longitude": point.coordinate.longitude,
            "timestamp": point.timestamp.timeIntervalSince1970 * 1000,
            "accuracy": point.horizontalAccuracy
        ])
    }

    func locationTracker(_ tracker: LocationTracker, didFailWithError error: Error) {
        notifyListeners("error", data: ["message": error.localizedDescription])
    }

    // Resolve pending permission-request promises once CLLocationManager
    // reports the new status — request*Authorization is async, so the
    // promises parked in requestWhenInUsePermission/requestAlwaysPermission
    // are fulfilled here instead of at the call site.
    func locationTracker(_ tracker: LocationTracker, didChangeAuthorization status: CLAuthorizationStatus) {
        if let call = pendingWhenInUseCall, status != .notDetermined {
            pendingWhenInUseCall = nil
            call.resolve(["location": whenInUseResult(for: status)])
        }
        if let call = pendingAlwaysCall, status == .authorizedAlways || status == .authorizedWhenInUse || status == .denied || status == .restricted {
            pendingAlwaysCall = nil
            call.resolve(["location": permissionState(for: status).rawValue])
        }
    }

    // MARK: - Status mapping

    private enum PermissionState: String {
        case granted, whenInUseOnly, denied, prompt
    }

    private func permissionState(for status: CLAuthorizationStatus) -> PermissionState {
        switch status {
        case .authorizedAlways:
            return .granted
        case .authorizedWhenInUse:
            return .whenInUseOnly
        case .notDetermined:
            return .prompt
        case .denied, .restricted:
            return .denied
        @unknown default:
            return .denied
        }
    }

    private func whenInUseResult(for status: CLAuthorizationStatus) -> String {
        switch status {
        case .authorizedWhenInUse, .authorizedAlways:
            return "granted"
        case .notDetermined:
            return "prompt"
        default:
            return "denied"
        }
    }
}
