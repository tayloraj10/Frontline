import { NextResponse } from "next/server";

// Android App Links verification. TODO: replace PLACEHOLDER_SHA256_FINGERPRINT
// with the release keystore's SHA-256 fingerprint once one exists
// (`keytool -list -v -keystore <release>.keystore`), and add the debug
// keystore's fingerprint as a second entry if App Links need to verify on
// debug builds too. See AndroidManifest.xml's intent-filter comment.
export async function GET() {
  return NextResponse.json([
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: "com.frontline.app",
        sha256_cert_fingerprints: ["PLACEHOLDER_SHA256_FINGERPRINT"],
      },
    },
  ]);
}
