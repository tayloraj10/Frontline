/** Where Stripe Checkout sends people back: the current page plus a flag that CheckoutNotice reads and clears. */
export function checkoutReturnUrl(result: "success" | "cancelled"): string {
  const url = new URL(window.location.href);
  url.searchParams.set("checkout", result);
  return url.toString();
}
