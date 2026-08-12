"use client";

import { AnimatePresence, motion } from "framer-motion";

interface ConfirmModalProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Styles the confirm button as a destructive action (red) vs a neutral one (zinc). Default true. */
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Themed replacement for window.confirm — the native dialog works fine inside the
 * Capacitor app (WKWebView/Android WebView both implement it) but renders as a
 * plain unstyled OS alert instead of matching the app's dark theme.
 */
export default function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = true,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4 py-8"
          onClick={onCancel}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 8 }}
            transition={{ type: "spring", stiffness: 400, damping: 32 }}
            className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-950 p-5 shadow-elevation-3"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-base font-bold text-zinc-100">{title}</h2>
            <p className="mt-2 text-sm text-zinc-400">{message}</p>
            <div className="mt-5 flex items-center gap-2">
              <button
                type="button"
                onClick={onCancel}
                className="flex-1 rounded-lg border border-zinc-700 bg-zinc-900/40 px-4 py-2.5 text-sm font-medium text-zinc-300 shadow-elevation-1 transition-[background-color,transform] duration-150 hover:bg-zinc-800 active:scale-[0.96] touch-manipulation"
              >
                {cancelLabel}
              </button>
              <button
                type="button"
                onClick={onConfirm}
                className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold text-white shadow-elevation-1 transition-[background-color,transform] duration-150 active:scale-[0.96] touch-manipulation ${
                  destructive ? "bg-red-700 hover:bg-red-600" : "bg-emerald-700 hover:bg-emerald-600"
                }`}
              >
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
