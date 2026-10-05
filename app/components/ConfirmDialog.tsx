"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  type LucideIcon,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Dialog konfirmasi & prompt pengganti window.confirm / window.prompt.
//
// Pakai:
//   const confirm = useConfirm();
//   if (!(await confirm({ title: "Hapus?", tone: "danger" }))) return;
//
//   const prompt = usePrompt();
//   const reason = await prompt({ title: "Alasan?" });
//   if (reason === null) return; // user menekan Batal
// ---------------------------------------------------------------------------

type Tone = "success" | "danger" | "warning" | "neutral";

export type ConfirmOptions = {
  title: string;
  /** Boleh teks biasa (\n jadi baris baru) atau elemen React. */
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: Tone;
  /** Ganti ikon bawaan tone-nya. */
  icon?: LucideIcon;
};

export type PromptOptions = ConfirmOptions & {
  inputLabel?: string;
  placeholder?: string;
  defaultValue?: string;
};

type DialogState =
  | {
      id: number;
      kind: "confirm";
      opts: ConfirmOptions;
      resolve: (value: boolean) => void;
    }
  | {
      id: number;
      kind: "prompt";
      opts: PromptOptions;
      resolve: (value: string | null) => void;
    };

type DialogApi = {
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
  /** Resolve ke teks yang diketik (bisa string kosong), atau null kalau Batal. */
  prompt: (opts: PromptOptions) => Promise<string | null>;
};

const TONES: Record<
  Tone,
  { icon: LucideIcon; iconWrap: string; button: string }
> = {
  success: {
    icon: CheckCircle2,
    iconWrap: "bg-emerald-500/10 text-emerald-400",
    button: "bg-emerald-500/90 hover:bg-emerald-500 text-black",
  },
  danger: {
    icon: AlertTriangle,
    iconWrap: "bg-red-500/10 text-red-400",
    button: "bg-red-500/90 hover:bg-red-500 text-white",
  },
  warning: {
    icon: AlertTriangle,
    iconWrap: "bg-amber-500/10 text-amber-400",
    button: "bg-amber-500/90 hover:bg-amber-500 text-black",
  },
  neutral: {
    icon: Info,
    iconWrap: "bg-accent-500/10 text-accent-400",
    button: "bg-accent-500 hover:bg-accent-400 text-white",
  },
};

const DialogContext = createContext<DialogApi | null>(null);

function cancelDialog(d: DialogState) {
  if (d.kind === "confirm") d.resolve(false);
  else d.resolve(null);
}

export function DialogProvider({ children }: { children: ReactNode }) {
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const currentRef = useRef<DialogState | null>(null);
  const seqRef = useRef(0);

  const open = useCallback((next: DialogState) => {
    // Kalau masih ada dialog terbuka, anggap dibatalkan.
    if (currentRef.current) cancelDialog(currentRef.current);
    currentRef.current = next;
    setDialog(next);
  }, []);

  const close = useCallback(() => {
    currentRef.current = null;
    setDialog(null);
  }, []);

  const api = useMemo<DialogApi>(
    () => ({
      confirm: (opts) =>
        new Promise<boolean>((resolve) =>
          open({ id: ++seqRef.current, kind: "confirm", opts, resolve }),
        ),
      prompt: (opts) =>
        new Promise<string | null>((resolve) =>
          open({ id: ++seqRef.current, kind: "prompt", opts, resolve }),
        ),
    }),
    [open],
  );

  // Kalau provider di-unmount saat dialog masih terbuka, jangan biarkan
  // promise menggantung.
  useEffect(() => {
    return () => {
      if (currentRef.current) cancelDialog(currentRef.current);
    };
  }, []);

  function handleCancel() {
    if (!dialog) return;
    cancelDialog(dialog);
    close();
  }

  function handleConfirm(inputValue: string) {
    if (!dialog) return;
    if (dialog.kind === "confirm") dialog.resolve(true);
    else dialog.resolve(inputValue.trim());
    close();
  }

  return (
    <DialogContext.Provider value={api}>
      {children}
      {dialog && (
        <DialogView
          key={dialog.id}
          dialog={dialog}
          onCancel={handleCancel}
          onConfirm={handleConfirm}
        />
      )}
    </DialogContext.Provider>
  );
}

function DialogView({
  dialog,
  onCancel,
  onConfirm,
}: {
  dialog: DialogState;
  onCancel: () => void;
  onConfirm: (inputValue: string) => void;
}) {
  const { opts } = dialog;
  const promptOpts = dialog.kind === "prompt" ? dialog.opts : null;
  const tone = opts.tone ?? "neutral";
  const style = TONES[tone];
  const Icon = opts.icon ?? style.icon;
  // Aksi berbahaya: fokus awal di "Batal" supaya Enter tidak sengaja menghapus.
  const focusCancel = tone === "danger";
  const titleId = useId();
  const [value, setValue] = useState(promptOpts?.defaultValue ?? "");

  // Esc untuk menutup
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  // Kunci scroll halaman selama dialog terbuka
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onSubmit={(e) => {
          e.preventDefault();
          onConfirm(value);
        }}
        className="w-full max-w-sm bg-panel border border-line rounded-2xl p-5 shadow-2xl animate-fadeIn"
      >
        <div
          className={`w-10 h-10 rounded-full flex items-center justify-center mb-3 ${style.iconWrap}`}
        >
          <Icon size={20} strokeWidth={1.75} />
        </div>

        <h3
          id={titleId}
          className="text-base font-semibold text-neutral-100 mb-1.5"
        >
          {opts.title}
        </h3>
        {opts.message && (
          <div className="text-sm text-neutral-400 leading-relaxed whitespace-pre-line">
            {opts.message}
          </div>
        )}

        {promptOpts && (
          <div className="mt-3">
            {promptOpts.inputLabel && (
              <label className="block text-xs text-neutral-400 mb-1.5 font-medium">
                {promptOpts.inputLabel}
              </label>
            )}
            <input
              autoFocus
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={promptOpts.placeholder}
              className="w-full bg-black/40 border border-line rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-accent-500 focus:ring-1 focus:ring-accent-500/50 transition-all"
            />
          </div>
        )}

        <div className="flex justify-end gap-2 mt-5">
          <button
            type="button"
            onClick={onCancel}
            autoFocus={focusCancel && !promptOpts}
            className="px-3.5 py-2 rounded-lg text-sm border border-line text-neutral-300 hover:border-neutral-500 transition-colors"
          >
            {opts.cancelLabel ?? "Batal"}
          </button>
          <button
            type="submit"
            autoFocus={!focusCancel && !promptOpts}
            className={`px-3.5 py-2 rounded-lg text-sm font-medium transition-colors ${style.button}`}
          >
            {opts.confirmLabel ?? "Ya"}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}

export function useDialog(): DialogApi {
  const ctx = useContext(DialogContext);
  if (!ctx) {
    throw new Error(
      "useDialog/useConfirm/usePrompt harus dipakai di dalam <DialogProvider>",
    );
  }
  return ctx;
}

export function useConfirm() {
  return useDialog().confirm;
}

export function usePrompt() {
  return useDialog().prompt;
}
