"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Button from "@/components/ui/Button";
import { Field, Note, TextArea } from "@/components/ui/fields";

/**
 * Group admin control for the Plus "open to sponsors" perk: a toggle plus a short pitch
 * shown on the group page next to the Support button.
 */
export default function GroupSponsorSettings({
  groupId,
  initialOpen,
  initialPitch,
}: {
  groupId: string;
  initialOpen: boolean;
  initialPitch: string | null;
}) {
  const [open, setOpen] = useState(initialOpen);
  const [pitch, setPitch] = useState(initialPitch ?? "");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ tone: "good" | "warn"; text: string } | null>(null);

  const save = async () => {
    setSaving(true);
    setStatus(null);
    const supabase = createClient();
    const { error } = await supabase
      .from("groups")
      .update({ open_to_sponsors: open, sponsor_pitch: pitch.trim() || null })
      .eq("id", groupId);
    setSaving(false);
    setStatus(error ? { tone: "warn", text: "Could not save. Try again." } : { tone: "good", text: "Saved." });
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-zinc-300">Open to sponsors</h2>
        <p className="mt-1 text-sm text-zinc-400">
          A Plus perk. When on, your group page shows a Support button so anyone can chip in directly. Gifts are reviewed by
          Frontline and paid out to the group.
        </p>
      </div>
      <label className="flex items-center gap-3 text-sm text-zinc-200">
        <input
          type="checkbox"
          className="h-5 w-5 accent-amber-400"
          checked={open}
          onChange={(e) => setOpen(e.target.checked)}
        />
        Accept direct sponsorship
      </label>
      <Field label="Pitch" optional hint="What would a sponsor's money go toward? Up to 400 characters.">
        <TextArea rows={3} maxLength={400} value={pitch} onChange={(e) => setPitch(e.target.value)} />
      </Field>
      <Button loading={saving} onClick={save}>
        Save sponsor settings
      </Button>
      {status && <Note tone={status.tone}>{status.text}</Note>}
    </div>
  );
}
