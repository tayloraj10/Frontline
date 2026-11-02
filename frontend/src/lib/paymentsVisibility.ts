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

/**
 * Gate for the Earn, Hire and Impact pages only. Same as paymentsVisible, plus users flagged
 * profiles.rewards_beta get in before payments_enabled goes live. Perks and every other
 * payments-gated surface keep using paymentsVisible.
 */
export function rewardsVisible(gate: PaymentsGate, isSiteAdmin: boolean, beta: boolean): boolean {
  return gate.preview && (isSiteAdmin || beta || gate.enabled);
}
