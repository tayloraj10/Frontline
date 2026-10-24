"use client";

import { useEffect, useRef, useState } from "react";
import Button from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, TextInput } from "@/components/ui/fields";
import { mk } from "@/lib/marketplace";

type Agreement = { id: string; kind: string; version: number; title: string; body: string };

/**
 * Click-through agreement: read to the end, type the legal name, tick the boxes. Cleaners also
 * confirm they are 18+. Acceptance is stored server-side per version with a timestamp.
 */
export default function AgreementAccept({
  kind,
  onAccepted,
}: {
  kind: "cleaner" | "customer";
  onAccepted: () => void;
}) {
  const [agreement, setAgreement] = useState<Agreement | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [readToEnd, setReadToEnd] = useState(false);
  const [agree, setAgree] = useState(false);
  const [adult, setAdult] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    mk<Agreement>(`/agreements/${kind}`)
      .then((a) => live && setAgreement(a))
      .catch((e: Error) => live && setLoadError(e.message));
    return () => {
      live = false;
    };
  }, [kind]);

  function onScroll() {
    const el = scroller.current;
    if (el && el.scrollTop + el.clientHeight >= el.scrollHeight - 8) setReadToEnd(true);
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await mk("/agreements/accept", {
        method: "POST",
        body: { kind, legal_name: name, is_adult: adult, app_version: "web" },
      });
      onAccepted();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (loadError) return <p className="text-sm text-red-400">{loadError}</p>;
  if (!agreement) return <p className="text-sm text-zinc-500">Loading agreement...</p>;

  const ready = readToEnd && agree && name.trim().length >= 3 && (kind !== "cleaner" || adult);

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="font-display text-lg font-extrabold text-zinc-100">{agreement.title}</h2>
        <p className="text-xs text-zinc-500">Version {agreement.version}. Read to the end to continue.</p>
      </div>
      <div
        ref={scroller}
        onScroll={onScroll}
        className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-2xl bg-zinc-950/60 p-4 text-sm leading-relaxed text-zinc-300 ring-1 ring-inset ring-white/5"
      >
        {agreement.body}
      </div>
      {!readToEnd && <p className="text-xs text-amber-400">Scroll to the end of the agreement to enable the checkboxes.</p>}
      <label className="flex items-start gap-3 text-sm text-zinc-200">
        <input
          type="checkbox"
          className="mt-1 h-5 w-5 shrink-0 accent-emerald-400"
          checked={agree}
          disabled={!readToEnd}
          onChange={(e) => setAgree(e.target.checked)}
        />
        <span>I have read and agree to this agreement.</span>
      </label>
      {kind === "cleaner" && (
        <label className="flex items-start gap-3 text-sm text-zinc-200">
          <input
            type="checkbox"
            className="mt-1 h-5 w-5 shrink-0 accent-emerald-400"
            checked={adult}
            disabled={!readToEnd}
            onChange={(e) => setAdult(e.target.checked)}
          />
          <span>I am at least 18 years old.</span>
        </label>
      )}
      <Field label="Full legal name" hint="Typing your name is your signature.">
        <TextInput value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="First Last" />
      </Field>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <Button className="w-full" disabled={!ready} loading={busy} onClick={submit}>
        Accept and continue
      </Button>
    </Card>
  );
}
