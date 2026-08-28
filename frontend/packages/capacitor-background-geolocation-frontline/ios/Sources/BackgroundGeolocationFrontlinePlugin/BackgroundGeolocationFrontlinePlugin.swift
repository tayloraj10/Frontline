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

        // Defensive symmetry with requestAlwaysPermission: fail safe if the callback is
        // ever missed, without racing the user's actual response time (see helper below).
        resolveIfNoSystemPromptAppears(
            for: call,
            getPending: { [weak self] in self?.pendingWhenInUseCall },
            clearPending: { [weak self] in self?.pendingWhenInUseCall = nil },
            resolvedLocation: { [weak self] in
                guard let self else { return "denied" }
                return self.whenInUseResult(for: self.tracker.authorizationStatus)
            }
        )
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

        // iOS only shows the "upgrade to Always" system alert once per install, and won't
        // show it at all if it's already been presented (or dismissed) previously — in that
        // case requestAlwaysAuthorization() is a silent no-op: authorizationStatus never
        // changes, so didChangeAuthorization never fires, and this call would otherwise hang
        // forever. resolveIfNoSystemPromptAppears tells that case apart from "the alert is
        // genuinely still on screen" so we don't cut off a slow-to-respond user.
        resolveIfNoSystemPromptAppears(
            for: call,
            getPending: { [weak self] in self?.pendingAlwaysCall },
            clearPending: { [weak self] in self?.pendingAlwaysCall = nil },
            resolvedLocation: { [weak self] in
                guard let self else { return "denied" }
                return self.permissionState(for: self.tracker.authorizationStatus).rawValue
            }
        )
    }

    // When iOS actually presents a system permission alert, the app immediately resigns
    // active (UIApplication.willResignActiveNotification). If that doesn't happen shortly
    // after requesting authorization, no alert was shown at all — a known silent no-op case
    // for the Always upgrade prompt — so it's safe to resolve immediately. If the alert *is*
    // showing, we cancel the fallback and wait indefinitely for the real answer instead of
    // racing a fixed timer against however long the user takes to respond.
    private func resolveIfNoSystemPromptAppears(
        for call: CAPPluginCall,
        getPending: @escaping () -> CAPPluginCall?,
        clearPending: @escaping () -> Void,
        resolvedLocation: @escaping () -> String
    ) {
        final class ObserverBox { var observer: NSObjectProtocol? }
        let box = ObserverBox()

        let resolveOnce = {
            guard let pending = getPending(), pending === call else { return }
            clearPending()
            if let observer = box.observer {
                NotificationCenter.default.removeObserver(observer)
                box.observer = nil
            }
            pending.resolve(["location": resolvedLocation()])
        }

        let noPromptWorkItem = DispatchWorkItem(block: resolveOnce)

        box.observer = NotificationCenter.default.addObserver(
            forName: UIApplication.willResignActiveNotification,
            object: nil,
            queue: .main
        ) { _ in
            noPromptWorkItem.cancel()
            if let observer = box.observer {
                NotificationCenter.default.removeObserver(observer)
                box.observer = nil
            }
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + 1, execute: noPromptWorkItem)

        // Absolute last resort: even if a real system prompt does appear (so the fast check
        // above backs off and waits), never wait forever — cap total wait time in case the
        // willResignActive heuristic ever false-positives on something unrelated to a
        // location dialog, or the delegate callback is missed for some other reason.
        DispatchQueue.main.asyncAfter(deadline: .now() + 8, execute: DispatchWorkItem(block: resolveOnce))
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
