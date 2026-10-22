import { useEffect, useRef, useState } from "react";
import { BookOpen, Loader2, RefreshCw, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: "Navbatda", cls: "bg-muted text-muted-foreground" },
  processing: { label: "O'qilmoqda...", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  ready: { label: "Tayyor", cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
  error: { label: "Xatolik", cls: "bg-destructive/10 text-destructive" },
};

const TRIAGE_LABEL: Record<string, string> = {
  emergency: "Tez yordamga",
  doctor: "Shifokorga",
  self_care: "Manbali javob",
};

const PAGES_PER_CALL = 15;
const PDFJS_VERSION = "4.10.38";
const PDFJS_BASE = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build`;

/** Extracts the text of every page with pdf.js (loaded on demand from the CDN). */
async function extractPdfPages(pdf: Blob, onPage: (done: number, total: number) => void): Promise<string[]> {
  const pdfjs: any = await import(/* @vite-ignore */ `${PDFJS_BASE}/pdf.min.mjs`);
  pdfjs.GlobalWorkerOptions.workerSrc = `${PDFJS_BASE}/pdf.worker.min.mjs`;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await pdf.arrayBuffer()) }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    pages.push(content.items.map((it: any) => (typeof it.str === "string" ? it.str + (it.hasEOL ? "\n" : " ") : "")).join(""));
    page.cleanup();
    onPage(i, doc.numPages);
  }
  await doc.destroy();
  return pages;
}

const BooksManager = ({ departments }: { departments: any[] }) => {
  const [books, setBooks] = useState<any[]>([]);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [language, setLanguage] = useState("uz");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<Record<string, string>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    const { data } = await supabase.from("medical_books").select("*").order("created_at", { ascending: false });
    setBooks(data ?? []);
  };

  const loadStats = async () => {
    const since = new Date(Date.now() - 30 * 86400_000).toISOString();
    const { data } = await supabase.from("ai_chat_logs").select("triage").gte("created_at", since).limit(10000);
    const counts: Record<string, number> = {};
    for (const r of data ?? []) counts[r.triage] = (counts[r.triage] ?? 0) + 1;
    setStats(counts);
  };

  useEffect(() => { load(); loadStats(); }, []);

  // Refresh while a book is being processed.
  useEffect(() => {
    if (!books.some((b) => b.status === "processing")) return;
    const id = setInterval(load, 4000);
    return () => clearInterval(id);
  }, [books]);

  // Reads the PDF in the browser and sends the text to the server in small batches.
  const ingest = async (bookId: string, pdf: Blob) => {
    setProgress((p) => ({ ...p, [bookId]: "PDF ochilmoqda..." }));
    try {
      const pages = await extractPdfPages(pdf, (done, total) =>
        setProgress((p) => ({ ...p, [bookId]: `Matn ajratilmoqda: ${done}/${total} bet` })));
      for (let i = 0; i < pages.length || i === 0; i += PAGES_PER_CALL) {
        const batch = pages.slice(i, i + PAGES_PER_CALL);
        const last = i + PAGES_PER_CALL >= pages.length;
        setProgress((p) => ({ ...p, [bookId]: `AI o'qiyapti: ${Math.min(i + PAGES_PER_CALL, pages.length)}/${pages.length} bet` }));
        for (let attempt = 0; ; attempt++) {
          const res = await supabase.functions.invoke("ingest-book", {
            body: { book_id: bookId, pages: batch, first_page: i + 1, reset: i === 0, done: last, total_pages: pages.length },
          });
          if (!res.error) break;
          let body: any = null;
          try { body = await (res.error as any)?.context?.json?.(); } catch { /* not JSON */ }
          if (body?.retry && attempt < 4) {
            // Free Gemini quota is per minute: wait and send the same batch again.
            for (let s = 60; s > 0; s--) {
              setProgress((p) => ({ ...p, [bookId]: `Gemini limiti: ${s} soniya kutilmoqda...` }));
              await new Promise((r) => setTimeout(r, 1000));
            }
            continue;
          }
          throw new Error(body?.error || res.error.message);
        }
        if (pages.length === 0) break;
      }
      toast.success("Kitob tayyor: AI endi undan foydalanadi");
    } catch (e: any) {
      const message = String(e?.message || e);
      toast.error(`Kitobni o'qib bo'lmadi: ${message.slice(0, 160)}`);
      // Make sure the book does not stay on "processing" forever.
      await supabase.from("medical_books").update({ status: "error", error_message: message.slice(0, 500) }).eq("id", bookId).eq("status", "processing");
    } finally {
      setProgress((p) => { const n = { ...p }; delete n[bookId]; return n; });
      load();
    }
  };

  const retryIngest = async (book: any) => {
    setProgress((p) => ({ ...p, [book.id]: "PDF yuklab olinmoqda..." }));
    const { data, error } = await supabase.storage.from("medical-books").download(book.storage_path);
    if (error || !data) {
      setProgress((p) => { const n = { ...p }; delete n[book.id]; return n; });
      toast.error("PDF faylni yuklab bo'lmadi");
      return;
    }
    await ingest(book.id, data);
  };

  const handleUpload = async () => {
    if (!title.trim() || !file) { toast.error("Kitob nomi va PDF fayl kerak"); return; }
    if (file.type !== "application/pdf") { toast.error("Faqat PDF fayl yuklang"); return; }
    if (file.size > 50 * 1024 * 1024) { toast.error("Fayl 50 MB dan katta"); return; }

    setUploading(true);
    try {
      const path = `${crypto.randomUUID()}.pdf`;
      const { error: upError } = await supabase.storage.from("medical-books").upload(path, file, { contentType: "application/pdf" });
      if (upError) throw upError;

      const { data: book, error } = await supabase.from("medical_books").insert({
        title: title.trim(),
        author: author.trim() || null,
        department_id: departmentId || null,
        language,
        storage_path: path,
      }).select().single();
      if (error) {
        await supabase.storage.from("medical-books").remove([path]);
        throw error;
      }

      toast.success("Kitob yuklandi, endi AI uni o'qiydi. Sahifani yopmang.");
      setTitle(""); setAuthor(""); setDepartmentId(""); setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      setUploading(false);
      await ingest(book.id, file);
    } catch (e: any) {
      toast.error(e?.message || "Yuklashda xatolik");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (book: any) => {
    if (!confirm(`"${book.title}" o'chirilsinmi?`)) return;
    const { error } = await supabase.from("medical_books").delete().eq("id", book.id);
    if (error) { toast.error(error.message); return; }
    await supabase.storage.from("medical-books").remove([book.storage_path]);
    toast.success("Kitob o'chirildi");
    load();
  };

  const totalAsked = (Object.values(stats) as number[]).reduce((a, b) => a + b, 0);
  const inputClass = "px-3 py-2 rounded-lg border border-input bg-background text-foreground text-sm";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-card rounded-xl border border-border p-4">
          <div className="text-2xl font-display font-bold text-foreground">{totalAsked}</div>
          <div className="text-xs text-muted-foreground">AI so'rovlari (30 kun)</div>
        </div>
        {(["self_care", "doctor", "emergency"] as const).map((k) => (
          <div key={k} className="bg-card rounded-xl border border-border p-4">
            <div className="text-2xl font-display font-bold text-foreground">{stats[k] ?? 0}</div>
            <div className="text-xs text-muted-foreground">{TRIAGE_LABEL[k]}</div>
          </div>
        ))}
      </div>

      <div className="bg-card rounded-xl border border-border p-4">
        <h3 className="font-display font-semibold text-foreground mb-1">Tibbiy kitob yuklash</h3>
        <p className="text-xs text-muted-foreground mb-3">
          AI-yordamchi faqat shu kitoblarga tayanib javob beradi va manbani ko'rsatadi. Matnli PDF yuklang (skanerlangan rasm emas).
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Kitob nomi *" className={inputClass} />
          <input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Muallif" className={inputClass} />
          <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} className={inputClass}>
            <option value="">Bo'lim (ixtiyoriy)</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name_uz}</option>)}
          </select>
          <select value={language} onChange={(e) => setLanguage(e.target.value)} className={inputClass}>
            <option value="uz">O'zbekcha</option>
            <option value="ru">Ruscha</option>
            <option value="en">Inglizcha</option>
          </select>
          <input ref={fileRef} type="file" accept="application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className={`${inputClass} md:col-span-2`} />
        </div>
        <button onClick={handleUpload} disabled={uploading} className="mt-3 px-4 py-2 rounded-lg bg-hero-gradient text-primary-foreground text-sm font-medium disabled:opacity-50 inline-flex items-center gap-1.5">
          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          {uploading ? "Yuklanmoqda..." : "Yuklash"}
        </button>
      </div>

      <div className="space-y-2">
        {books.length === 0 && (
          <div className="bg-card rounded-xl border border-border p-8 text-center text-muted-foreground text-sm">Hali kitob yuklanmagan</div>
        )}
        {books.map((b) => {
          const st = STATUS[b.status] ?? STATUS.pending;
          const dept = departments.find((d) => d.id === b.department_id);
          return (
            <div key={b.id} className="bg-card rounded-xl border border-border p-4 flex items-start justify-between gap-3">
              <div className="flex gap-3 min-w-0">
                <BookOpen className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <div className="font-medium text-foreground text-sm">{b.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {[b.author, dept?.name_uz, b.status === "ready" ? `${b.page_count} bet, ${b.chunk_count} bo'lak` : null].filter(Boolean).join(" · ")}
                  </div>
                  {progress[b.id] && <div className="text-xs text-amber-700 dark:text-amber-400 mt-1 inline-flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> {progress[b.id]}</div>}
                  {!progress[b.id] && b.status === "error" && b.error_message && <div className="text-xs text-destructive mt-1">{b.error_message}</div>}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${st.cls}`}>{st.label}</span>
                {!progress[b.id] && (b.status === "error" || b.status === "pending" || b.status === "processing") && (
                  <button onClick={() => retryIngest(b)} title="Qayta o'qish" className="p-1.5 rounded-lg text-foreground hover:bg-secondary"><RefreshCw className="w-4 h-4" /></button>
                )}
                <button onClick={() => handleDelete(b)} title="O'chirish" className="p-1.5 rounded-lg text-destructive hover:bg-destructive/10"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default BooksManager;
