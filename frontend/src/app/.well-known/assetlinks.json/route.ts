import { NextResponse } from "next/server";

// Android App Links verification. Fingerprint is the app signing key's SHA-256
// (`keytool -list -v -keystore frontline-app-signing-key.jks -alias frontline-classical`),
// updated 2026-08-09 after switching off quantum-ready hybrid Play App Signing
// (PQC signing broke Credential Manager Google Sign-In). Add the debug keystore's
// fingerprint as a second entry if App Links need to verify on debug builds too.
// See AndroidManifest.xml's intent-filter comment.
export async function GET() {
  return NextResponse.json([
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: "com.frontlinemaps.app",
        sha256_cert_fingerprints: ["70:63:31:BF:8C:02:28:CD:66:76:AF:27:5C:22:4F:D7:E6:D4:60:8F:9B:87:0B:82:EE:53:DC:6C:2E:C1:7A:F4"],
      },
    },
  ]);
}
