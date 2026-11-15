"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, GripVertical, Plus, Trash2 } from "lucide-react";
import { mk } from "@/lib/marketplace";
import { CATEGORY_COLORS, CATEGORY_ICONS, categoryColor, categoryIcon, refreshCategories, type JobCategory } from "@/lib/categories";

type BoolField = "active" | "bags_required" | "after_photo_required" | "requires_permission" | "hazard_risk";

const TOGGLES: { field: BoolField; head: string; hint: string }[] = [
  { field: "active", head: "On", hint: "Off hides it from new jobs and the picker. Old jobs keep their type." },
  { field: "bags_required", head: "Bags", hint: "Cleaner confirms the haul is bagged and in the finish photo." },
  { field: "after_photo_required", head: "Photo", hint: "Finish photo required. Off makes it optional." },
  { field: "requires_permission", head: "Land", hint: "Poster must confirm they own the land or have permission." },
  { field: "hazard_risk", head: "Hazard", hint: "Flags the category as risky. Shows warnings and needs an extra acknowledgement. We do not add hazardous categories." },
];

const cell = "min-h-11 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100";

function Row({ cat, dragging, onGrab, onChanged, onError }: {
  cat: JobCategory;
  dragging: boolean;
  onGrab: (key: string) => void;
  onChanged: () => void;
  onError: (m: string) => void;
}) {
  const [draft, setDraft] = useState(cat);
  useEffect(() => setDraft(cat), [cat]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(cat);
  const Icon = categoryIcon(draft.icon);
  const color = categoryColor(draft.color);
  const set = <K extends keyof JobCategory>(k: K, v: JobCategory[K]) => setDraft((d) => ({ ...d, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      const { key: _key, ...body } = draft;
      void _key;
      await mk(`/admin/categories/${cat.key}`, { method: "PATCH", body });
      await refreshCategories();
      onChanged();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!window.confirm(`Delete "${cat.label}"? This cannot be undone.`)) return;
    try {
      await mk(`/admin/categories/${cat.key}`, { method: "DELETE" });
      await refreshCategories();
      onChanged();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Could not delete.");
    }
  };

  return (
    <Fragment>
      <tr
        data-cat={cat.key}
        className={`border-t border-zinc-800 align-middle ${draft.active ? "" : "opacity-60"} ${dragging ? "bg-emerald-950/30" : ""}`}
      >
        <td className="px-1 py-3 text-center">
          <button
            type="button"
            aria-label={`Drag to reorder ${cat.label}`}
            onPointerDown={(e) => {
              e.preventDefault();
              onGrab(cat.key);
            }}
            style={{ touchAction: "none" }}
            className="flex h-11 w-11 cursor-grab items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200 active:cursor-grabbing"
          >
            <GripVertical className="h-5 w-5" aria-hidden="true" />
          </button>
        </td>
        <td className="px-3 py-3">
          <div className="flex items-center gap-3">
            <Icon className={`h-5 w-5 shrink-0 ${color.icon}`} aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <input aria-label="Label" className={cell} value={draft.label} onChange={(e) => set("label", e.target.value)} />
              <code className="text-[10px] text-zinc-500">{cat.key}</code>
            </div>
          </div>
        </td>
        <td className="px-2 py-3">
          <input aria-label="Short label" className={cell} value={draft.short_label} onChange={(e) => set("short_label", e.target.value)} />
        </td>
        <td className="px-2 py-3">
          <select aria-label="Icon" className={cell} value={draft.icon} onChange={(e) => set("icon", e.target.value)}>
            {Object.keys(CATEGORY_ICONS).map((k) => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>
        </td>
        <td className="px-2 py-3">
          <select aria-label="Color" className={cell} value={draft.color} onChange={(e) => set("color", e.target.value)}>
            {Object.keys(CATEGORY_COLORS).map((k) => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>
        </td>
        <td className="px-2 py-3">
          <input
            aria-label="Order"
            type="number"
            inputMode="numeric"
            className={cell}
            value={draft.sort_order}
            onChange={(e) => set("sort_order", Number(e.target.value) || 0)}
          />
        </td>
        {TOGGLES.map((t) => (
          <td key={t.field} className="px-2 py-3 text-center">
            <label className="flex h-11 w-11 items-center justify-center">
              <input
                type="checkbox"
                aria-label={`${t.head}: ${cat.label}`}
                title={t.hint}
                className={`h-5 w-5 ${t.field === "hazard_risk" ? "accent-red-400" : "accent-emerald-400"}`}
                checked={draft[t.field]}
                onChange={(e) => set(t.field, e.target.checked)}
              />
            </label>
          </td>
        ))}
        <td className="px-2 py-3">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              aria-label={`${open ? "Hide" : "Edit"} text for ${cat.label}`}
              className="flex h-11 w-11 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-800"
            >
              {open ? <ChevronDown className="h-4 w-4" aria-hidden="true" /> : <ChevronRight className="h-4 w-4" aria-hidden="true" />}
            </button>
            <button
              type="button"
              disabled={!dirty || saving}
              onClick={save}
              className="min-h-11 rounded-lg bg-emerald-600 px-3 text-sm font-semibold text-white disabled:opacity-30"
            >
              {saving ? "..." : "Save"}
            </button>
            <button
              type="button"
              onClick={remove}
              aria-label={`Delete ${cat.label}`}
              className="flex h-11 w-11 items-center justify-center rounded-lg text-red-400 hover:bg-red-950/40"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </td>
      </tr>
      {open && (
        <tr className="bg-zinc-900/40">
          <td colSpan={11} className="px-3 py-2">
            <div className="grid gap-2 sm:grid-cols-3">
              <label className="space-y-1 text-xs text-zinc-400">
                What it covers (wrap text in {"{{ }}"} to highlight it orange)
                <textarea className={`${cell} py-2`} rows={3} value={draft.description} onChange={(e) => set("description", e.target.value)} />
              </label>
              <label className="space-y-1 text-xs text-zinc-400">
                Rule note (limits, warnings)
                <textarea className={`${cell} py-2`} rows={3} value={draft.rule_note} onChange={(e) => set("rule_note", e.target.value)} />
              </label>
              <label className="space-y-1 text-xs text-zinc-400">
                Corner badge (optional, short)
                <input className={cell} maxLength={30} value={draft.badge ?? ""} onChange={(e) => set("badge", e.target.value)} placeholder="Good for businesses" />
              </label>
            </div>
          </td>
        </tr>
      )}
    </Fragment>
  );
}

export default function JobCategoriesAdmin() {
  const [cats, setCats] = useState<JobCategory[] | null>(null);
  const [error, setError] = useState("");
  const [newKey, setNewKey] = useState("");
  const [newLabel, setNewLabel] = useState("");

  const load = useCallback(async () => {
    try {
      setCats(await mk<JobCategory[]>("/admin/categories"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load categories.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Drag to reorder: the grip hands the pointer to window listeners, which swap rows live and save on release.
  const [dragKey, setDragKey] = useState<string | null>(null);
  const latest = useRef<JobCategory[] | null>(null);
  latest.current = cats;

  useEffect(() => {
    if (!dragKey) return;
    const move = (e: PointerEvent) => {
      const row = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("tr[data-cat]");
      const over = row?.dataset.cat;
      if (!over || over === dragKey) return;
      setCats((list) => {
        if (!list) return list;
        const from = list.findIndex((c) => c.key === dragKey);
        const to = list.findIndex((c) => c.key === over);
        if (from < 0 || to < 0) return list;
        const next = [...list];
        next.splice(to, 0, next.splice(from, 1)[0]);
        return next;
      });
    };
    const up = async () => {
      setDragKey(null);
      const list = latest.current;
      if (!list) return;
      const changed = list.map((c, i) => ({ c, order: (i + 1) * 10 })).filter(({ c, order }) => c.sort_order !== order);
      if (!changed.length) return;
      setCats(list.map((c, i) => ({ ...c, sort_order: (i + 1) * 10 })));
      try {
        for (const { c, order } of changed) {
          await mk(`/admin/categories/${c.key}`, { method: "PATCH", body: { sort_order: order } });
        }
        await refreshCategories();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save the new order.");
      }
      await load();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
    window.addEventListener("pointercancel", up, { once: true });
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [dragKey, load]);

  const add = async () => {
    setError("");
    try {
      await mk("/admin/categories", {
        method: "POST",
        body: { key: newKey.trim(), label: newLabel.trim(), sort_order: (cats?.length ?? 0) * 10 + 10 },
      });
      setNewKey("");
      setNewLabel("");
      await refreshCategories();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add.");
    }
  };

  return (
    <div id="settings-job-categories" className="space-y-3 scroll-mt-20">
      <h2 className="text-sm font-semibold text-zinc-300">Job categories</h2>
      <p className="-mt-1.5 text-xs text-zinc-500">
        Types a neighbor can post and a cleaner can take. Changes apply right away to new jobs. A category in use cannot be
        deleted, turn it off instead. Drag the grip to reorder. Hover a checkbox for what it does; use the arrow to edit the description and rule note.
        Hazardous categories are against policy, so leave Hazard off unless that policy changes.
      </p>
      {error && <p role="alert" className="rounded-lg bg-red-950/40 px-3 py-2 text-xs text-red-300">{error}</p>}
      {cats === null && !error && <p className="text-xs text-zinc-500">Loading...</p>}
      {cats && (
        <div className="max-h-[calc(100vh-9rem)] overflow-auto rounded-xl border border-zinc-800">
          <table className="w-full min-w-[1500px] table-fixed text-left text-xs text-zinc-400">
            <thead className="sticky top-0 z-10 bg-zinc-950">
              <tr className="text-zinc-500">
                <th className="w-14 px-1 py-3" />
                <th className="w-80 px-3 py-3 font-medium">Category</th>
                <th className="w-40 px-2 py-3 font-medium">Short</th>
                <th className="w-40 px-2 py-3 font-medium">Icon</th>
                <th className="w-40 px-2 py-3 font-medium">Color</th>
                <th className="w-24 px-2 py-3 font-medium">Order</th>
                {TOGGLES.map((t) => (
                  <th key={t.field} className="w-20 px-2 py-3 text-center font-medium" title={t.hint}>{t.head}</th>
                ))}
                <th className="w-56 px-2 py-3" />
              </tr>
            </thead>
            <tbody>
              {cats.map((c) => (
                <Row key={c.key} cat={c} dragging={dragKey === c.key} onGrab={setDragKey} onChanged={() => { setError(""); void load(); }} onError={setError} />
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="grid gap-2 rounded-xl border border-dashed border-zinc-700 p-3 sm:grid-cols-[1fr_1fr_auto]">
        <input
          className={cell}
          placeholder="key (e.g. leaf_removal)"
          value={newKey}
          onChange={(e) => setNewKey(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
        />
        <input className={cell} placeholder="Label" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} />
        <button
          type="button"
          disabled={!newKey || !newLabel}
          onClick={add}
          className="inline-flex min-h-11 items-center justify-center gap-1 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white disabled:opacity-40"
        >
          <Plus className="h-4 w-4" aria-hidden="true" /> Add
        </button>
      </div>
    </div>
  );
}
