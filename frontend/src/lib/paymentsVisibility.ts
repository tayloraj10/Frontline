/**
 * Single rule for "should payment UI/APIs be shown to this viewer".
 *
 *   preview (payments_admin_preview, default on) must be on, AND
 *   the viewer is a site admin OR payments_enabled is on.
 *
 * Turning preview off hides every payment surface for everyone, admins included, so an
 * admin can see the app exactly as a normal user does. Turning payments_enabled on is the
 * actual "go live" switch for non-admins.
 */
export type PaymentsGate = { enabled: boolean; preview: boolean };

export function paymentsVisible(gate: PaymentsGate, isSiteAdmin: boolean): boolean {
  return gate.preview && (isSiteAdmin || gate.enabled);
}
