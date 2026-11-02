/** Small help line for screens that move money, so nobody is stuck if a payment looks wrong. */
export default function MoneySupport() {
  return (
    <p className="mt-6 text-center text-xs text-zinc-500">
      Payment question or something look wrong?{" "}
      <a
        href="mailto:frontlinemapsapp@gmail.com?subject=Payment%20help"
        className="inline-flex min-h-11 items-center font-semibold text-emerald-400 hover:text-emerald-300"
      >
        Contact support
      </a>
    </p>
  );
}
