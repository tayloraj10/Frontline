import { NextResponse } from "next/server";

// Android App Links verification. Fingerprint is the release keystore's SHA-256
// (`keytool -list -v -keystore frontline-release.jks -alias frontline`), added
// 2026-08-07. Add the debug keystore's fingerprint as a second entry if App
// Links need to verify on debug builds too. See AndroidManifest.xml's intent-filter comment.
export async function GET() {
  return NextResponse.json([
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: "com.frontline.app",
        sha256_cert_fingerprints: ["47:1D:E4:D6:83:E0:B2:28:9B:88:7B:2A:A5:B8:D4:70:23:F6:57:97:F9:3F:F2:B9:A9:BE:42:3C:C5:7F:D9:16"],
      },
    },
  ]);
}
