"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  ShieldCheck,
  Upload,
  X,
  XCircle,
} from "lucide-react";
import {
  KIND_LABEL,
  readShopeeFile,
  type FileKind,
  type ReadResult,
} from "@/lib/analytics/readFile";
import { ParseError } from "@/lib/analytics/parse";
import {
  checkUpload,
  sendUpload,
  type UploadInput,
} from "@/lib/analytics/uploadClient";
import {
  KIND_ORDER,
  daysSince,
  periodLabel,
  sortForSaving,
  summaryOf,
} from "@/lib/analytics/uploadView";

const MAX_BYTES = 25 * 1024 * 1024;

type LastUpload = {
  file_name: string;
  period_start: string | null;
  period_end: string | null;
  row_count: number | null;
  uploaded_by: string;
  uploaded_at: string;
};
type StoreInfo = {
  id: string;
  code: string;
  name: string;
  username: string | null;
  last: Record<FileKind, LastUpload | null>;
};

type Status =
  | "reading"
  | "need_store"
  | "checking"
  | "ready"
  | "blocked"
  | "saving"
  | "saved"
  | "failed"
  | "unreadable";

type Item = {
  id: string;
  file: File;
  status: Status;
  result?: ReadResult;
  error?: string;
  parserWarnings: string[];
  serverWarnings: string[];
  progress?: { done: number; total: number };
  savedRows?: number;
};

const STATUS_UI: Record<Status, { label: string; cls: string }> = {
  reading: { label: "Membaca file…", cls: "text-neutral-400" },
  need_store: { label: "Pilih toko dulu", cls: "text-amber-400" },
  checking: { label: "Memeriksa…", cls: "text-neutral-400" },
  ready: { label: "Siap disimpan", cls: "text-emerald-400" },
  blocked: { label: "Ditolak", cls: "text-red-400" },
  saving: { label: "Menyimpan…", cls: "text-neutral-300" },
  saved: { label: "Tersimpan", cls: "text-emerald-400" },
  failed: { label: "Gagal", cls: "text-red-400" },
  unreadable: { label: "Tidak bisa dibaca", cls: "text-red-400" },
};

function toInput(r: ReadResult): UploadInput {
  return {
    kind: r.kind,
    fileName: r.fileName,
    parsed: {
      rows: r.parsed.rows,
      store: r.parsed.store,
      period: r.parsed.period,
      balanceFirst: r.kind === "wallet" ? r.parsed.balanceFirst : undefined,
      balanceLast: r.kind === "wallet" ? r.parsed.balanceLast : undefined,
      fileTotal: r.kind === "ads_auto" ? r.parsed.fileTotal : undefined,
    },
  };
}

const canRecheck = (it: Item) =>
  !!it.result &&
  (it.status === "need_store" ||
    it.status === "ready" ||
    it.status === "blocked" ||
    it.status === "failed");

export default function UploadTab({ currentUser }: { currentUser: string }) {
  const router = useRouter();
  const [admin, setAdmin] = useState<string | null>(null);
  const [stores, setStores] = useState<StoreInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [storeId, setStoreId] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);

  const storeRef = useRef(""); // pilihan toko terbaru, dibaca oleh proses yang berjalan async
  const seq = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadMe = useCallback(async () => {
    try {
      const res = await fetch("/api/analytics/me");
      if (res.status === 401) {
        setSessionExpired(true);
        return;
      }
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setLoadError(data.error ?? "Gagal memuat daftar toko.");
        return;
      }
      setAdmin(data.admin);
      setStores(data.stores);
      setLoadError(null);
      // Satu toko saja: pilih otomatis. Lebih dari satu: harus dipilih sendiri supaya tidak salah toko.
      if (!storeRef.current && data.stores.length === 1) {
        storeRef.current = data.stores[0].id;
        setStoreId(data.stores[0].id);
      }
    } catch {
      setLoadError("Gagal menghubungi server.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMe();
  }, [loadMe]);

  const patch = useCallback((id: string, p: Partial<Item>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...p } : it)));
  }, []);

  async function runCheck(id: string, result: ReadResult, sid: string) {
    patch(id, { status: "checking", error: undefined, serverWarnings: [] });
    const c = await checkUpload(toInput(result), sid);
    if (storeRef.current !== sid) return; // toko diganti saat menunggu; pemeriksaan baru sudah berjalan
    if (c.ok)
      patch(id, {
        status: "ready",
        serverWarnings: c.warnings,
        error: undefined,
      });
    else patch(id, { status: "blocked", error: c.error });
  }

  async function readAndCheck(id: string, file: File) {
    if (file.size > MAX_BYTES) {
      patch(id, {
        status: "unreadable",
        error: "File terlalu besar (maksimal 25 MB).",
      });
      return;
    }
    try {
      const result = await readShopeeFile(file);
      const sid = storeRef.current;
      patch(id, {
        result,
        parserWarnings: result.parsed.warnings,
        status: sid ? "checking" : "need_store",
      });
      if (sid) await runCheck(id, result, sid);
    } catch (e) {
      patch(id, {
        status: "unreadable",
        error:
          e instanceof ParseError
            ? e.message
            : "File tidak bisa dibuka. Pastikan ini file asli dari Shopee dan belum diubah.",
      });
    }
  }

  function addFiles(files: FileList | File[]) {
    for (const file of Array.from(files)) {
      const id = `f${++seq.current}`;
      setItems((prev) => [
        ...prev,
        { id, file, status: "reading", parserWarnings: [], serverWarnings: [] },
      ]);
      void readAndCheck(id, file);
    }
  }

  function selectStore(id: string) {
    storeRef.current = id;
    setStoreId(id);
    for (const it of items.filter(canRecheck)) {
      if (id) void runCheck(it.id, it.result!, id);
      else
        patch(it.id, {
          status: "need_store",
          serverWarnings: [],
          error: undefined,
        });
    }
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files);
  }

  function onPick(e: ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files.length > 0) addFiles(e.target.files);
    e.target.value = ""; // supaya file yang sama bisa dipilih lagi
  }

  const savable = items.filter(
    (it) => it.status === "ready" || it.status === "failed",
  );

  async function saveAll() {
    const sid = storeId;
    if (!sid || busy) return;
    setBusy(true);
    for (const it of sortForSaving(savable)) {
      const result = it.result!;
      const input = toInput(result);
      const total = input.parsed.rows.length;
      patch(it.id, {
        status: "saving",
        error: undefined,
        progress: { done: 0, total },
      });

      // Periksa ulang tepat sebelum menyimpan: tiket baru, dan kesinambungan saldo dihitung
      // terhadap file yang baru saja disimpan sebelumnya.
      const c = await checkUpload(input, sid);
      if (!c.ok) {
        patch(it.id, { status: "failed", error: c.error });
        continue;
      }
      const r = await sendUpload(input, c.ticket, (done, t) =>
        patch(it.id, { progress: { done, total: t } }),
      );
      if (r.ok) {
        patch(it.id, {
          status: "saved",
          savedRows: r.saved,
          serverWarnings: c.warnings,
        });
      } else {
        patch(it.id, {
          status: "failed",
          error: `${r.error} (${r.saved} dari ${total} baris sudah tersimpan; aman diulang, tidak akan dobel)`,
        });
      }
    }
    setBusy(false);
    await loadMe();
  }

  const store = stores.find((s) => s.id === storeId) ?? null;
  const hasWarnings = savable.some(
    (it) => it.parserWarnings.length + it.serverWarnings.length > 0,
  );

  // ---------------------------------------------------------------- keadaan khusus
  if (loading) return <p className="text-sm text-neutral-500">Memuat…</p>;

  if (sessionExpired) {
    return (
      <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-5 text-sm text-amber-200 max-w-xl">
        <p className="flex items-center gap-2 font-medium mb-2">
          <AlertTriangle size={16} className="shrink-0" />
          Sesi login belum berlaku untuk Analytics
        </p>
        <p className="mb-4 text-amber-200/80">
          Analytics memakai sesi login yang diperiksa server. Keluar lalu masuk
          lagi dengan password kamu.
        </p>
        <button
          onClick={() => {
            sessionStorage.removeItem("modiusUser");
            router.push("/");
          }}
          className="bg-accent-500 hover:bg-accent-400 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          Masuk lagi
        </button>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-sm text-red-300 max-w-xl">
        {loadError}
      </div>
    );
  }

  if (stores.length === 0) {
    return (
      <div className="bg-panel border border-line rounded-xl p-5 text-sm text-neutral-400 max-w-xl">
        Belum ada toko Shopee yang kamu kelola di sistem.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6 items-start">
      <div>
        {admin && admin !== currentUser && (
          <div className="mb-4 bg-amber-500/10 border border-amber-500/20 rounded-lg px-4 py-2.5 text-sm text-amber-200">
            Sesi login di server atas nama {admin}, sedangkan halaman ini
            menampilkan {currentUser}. Keluar lalu masuk lagi supaya sama.
          </div>
        )}

        {/* Pilih toko */}
        <div className="bg-panel border border-line rounded-xl p-5 mb-4">
          <label className="text-xs text-neutral-400 mb-1.5 font-medium block">
            Toko tujuan
          </label>
          <select
            value={storeId}
            onChange={(e) => selectStore(e.target.value)}
            className="w-full bg-black/40 border border-line rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-accent-500 focus:ring-1 focus:ring-accent-500/50 transition-all"
          >
            <option value="">— pilih toko —</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.code})
              </option>
            ))}
          </select>
          {store && (
            <p className="text-[11px] mt-2 text-neutral-500">
              {store.username ? (
                <>
                  Username Shopee terdaftar:{" "}
                  <span className="text-neutral-300">{store.username}</span>
                </>
              ) : (
                <span className="text-amber-400">
                  Username Shopee toko ini belum tersimpan di sistem, jadi file
                  belum bisa dicocokkan otomatis.
                </span>
              )}
            </p>
          )}
        </div>

        {/* Area unggah */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          className={`cursor-pointer border border-dashed rounded-xl px-5 py-8 text-center transition-colors ${
            dragging
              ? "border-accent-500 bg-accent-500/5"
              : "border-line hover:border-neutral-500"
          }`}
        >
          <Upload
            size={22}
            strokeWidth={1.75}
            className="mx-auto mb-2 text-neutral-500"
          />
          <p className="text-sm text-neutral-300">
            Tarik file Shopee ke sini, atau klik untuk memilih
          </p>
          <p className="text-xs text-neutral-500 mt-1">
            Pesanan, Penghasilan (Income sudah dilepas), Saldo, Iklan, dan
            Rincian Iklan Produk Otomatis. Jenisnya dikenali otomatis. Boleh
            beberapa file sekaligus.
          </p>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".xlsx,.csv"
            onChange={onPick}
            className="hidden"
          />
        </div>
        <p className="text-[11px] text-neutral-500 mt-2 flex items-start gap-1.5">
          <ShieldCheck
            size={13}
            className="shrink-0 mt-0.5 text-emerald-400/80"
          />
          File dibaca di browser kamu. Username, nama, telepon, dan alamat
          pembeli tidak pernah dikirim ke server.
        </p>

        {/* Daftar file */}
        <div className="space-y-3 mt-5">
          {items.map((it) => {
            const ui = STATUS_UI[it.status];
            const warnings = [...it.parserWarnings, ...it.serverWarnings];
            const red =
              it.status === "blocked" ||
              it.status === "failed" ||
              it.status === "unreadable";
            const removable = it.status !== "saving";
            return (
              <div
                key={it.id}
                className={`bg-panel border rounded-xl p-4 ${
                  red
                    ? "border-red-500/40"
                    : warnings.length > 0 && it.status !== "saved"
                      ? "border-amber-500/40"
                      : "border-line"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <FileSpreadsheet
                      size={18}
                      strokeWidth={1.75}
                      className="text-neutral-500 shrink-0 mt-0.5"
                    />
                    <div className="min-w-0">
                      <p className="text-sm text-neutral-100 truncate">
                        {it.file.name}
                      </p>
                      {it.result && (
                        <p className="text-xs text-neutral-500 mt-0.5">
                          {KIND_LABEL[it.result.kind]} ·{" "}
                          {periodLabel(it.result.parsed.period)}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`text-xs font-medium flex items-center gap-1.5 ${ui.cls}`}
                    >
                      {(it.status === "reading" ||
                        it.status === "checking" ||
                        it.status === "saving") && (
                        <Loader2 size={13} className="animate-spin" />
                      )}
                      {it.status === "saved" && <CheckCircle2 size={13} />}
                      {red && <XCircle size={13} />}
                      {ui.label}
                    </span>
                    {removable && (
                      <button
                        onClick={() =>
                          setItems((prev) => prev.filter((x) => x.id !== it.id))
                        }
                        className="text-neutral-600 hover:text-neutral-300 transition-colors"
                        aria-label="Hapus dari daftar"
                      >
                        <X size={15} />
                      </button>
                    )}
                  </div>
                </div>

                {it.result && (
                  <div className="mt-3 text-xs text-neutral-400 space-y-0.5">
                    {summaryOf(it.result).map((l, i) => (
                      <p key={i}>{l}</p>
                    ))}
                  </div>
                )}

                {it.status === "saving" && it.progress && (
                  <div className="mt-3">
                    <div className="h-1.5 bg-black/30 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-accent-500 rounded-full transition-all duration-300"
                        style={{
                          width: `${it.progress.total ? (it.progress.done / it.progress.total) * 100 : 0}%`,
                        }}
                      />
                    </div>
                    <p className="text-[11px] text-neutral-500 mt-1 tabular-nums">
                      {it.progress.done} / {it.progress.total} baris
                    </p>
                  </div>
                )}

                {it.status === "saved" && (
                  <p className="mt-3 text-xs text-emerald-400">
                    {it.savedRows} baris tersimpan. Mengunggah file yang sama
                    lagi tidak akan membuat data dobel.
                  </p>
                )}

                {it.error && (
                  <p className="mt-3 text-xs text-red-300">{it.error}</p>
                )}

                {warnings.length > 0 && (
                  <ul className="mt-3 space-y-1">
                    {warnings.map((w, i) => (
                      <li
                        key={i}
                        className="text-xs text-amber-300 flex items-start gap-1.5"
                      >
                        <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                        {w}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>

        {items.length > 0 && (
          <div className="mt-5 flex items-center gap-3 flex-wrap">
            <button
              onClick={saveAll}
              disabled={busy || savable.length === 0 || !storeId}
              className="shine-btn bg-accent-500 hover:bg-accent-400 disabled:opacity-50 disabled:cursor-not-allowed text-white px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2"
            >
              {busy && <Loader2 size={15} className="animate-spin" />}
              {busy
                ? "Menyimpan…"
                : savable.length > 0
                  ? `Simpan ${savable.length} file ke ${store?.code ?? "toko"}`
                  : "Belum ada file yang siap"}
            </button>
            {items.some((it) => it.status === "saved") && !busy && (
              <button
                onClick={() =>
                  setItems((prev) => prev.filter((it) => it.status !== "saved"))
                }
                className="text-xs text-neutral-500 hover:text-neutral-300"
              >
                Bersihkan yang sudah tersimpan
              </button>
            )}
            {hasWarnings && !busy && (
              <p className="text-xs text-amber-300">
                Ada peringatan di sebagian file. Baca dulu sebelum menyimpan.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Upload terakhir */}
      <div className="bg-panel border border-line rounded-xl p-5 lg:sticky lg:top-20">
        <h3 className="text-sm font-medium text-neutral-300 mb-1">
          Upload terakhir
        </h3>
        <p className="text-[11px] text-neutral-500 mb-4">
          {store ? `${store.name} (${store.code})` : "Pilih toko untuk melihat"}
        </p>
        {store ? (
          <div className="space-y-3">
            {KIND_ORDER.map((k) => {
              const l = store.last[k];
              const age = l ? daysSince(l.period_end) : null;
              return (
                <div
                  key={k}
                  className="border-t border-white/5 pt-3 first:border-0 first:pt-0"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-medium text-neutral-300">
                      {KIND_LABEL[k]}
                    </p>
                    {age != null && age > 7 && (
                      <span className="text-[10px] bg-amber-500/15 text-amber-300 px-1.5 py-0.5 rounded-full font-medium">
                        data berhenti {age} hari lalu
                      </span>
                    )}
                  </div>
                  {l ? (
                    <p className="text-[11px] text-neutral-500 mt-0.5">
                      {l.period_start && l.period_end
                        ? periodLabel({
                            start: l.period_start,
                            end: l.period_end,
                          })
                        : "periode tidak tercatat"}
                      <br />
                      {new Date(l.uploaded_at).toLocaleString("id-ID", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                        timeZone: "Asia/Jakarta",
                      })}{" "}
                      oleh {l.uploaded_by}
                    </p>
                  ) : (
                    <p className="text-[11px] text-neutral-600 mt-0.5">
                      Belum pernah diupload
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}
