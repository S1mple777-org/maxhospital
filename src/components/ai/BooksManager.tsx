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

const BooksManager = ({ departments }: { departments: any[] }) => {
  const [books, setBooks] = useState<any[]>([]);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [language, setLanguage] = useState("uz");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
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

  const startIngest = async (bookId: string) => {
    const { error } = await supabase.functions.invoke("ingest-book", { body: { book_id: bookId } });
    if (error) toast.error("Kitobni o'qishni boshlab bo'lmadi");
    load();
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

      toast.success("Kitob yuklandi, AI uni o'qiyapti");
      setTitle(""); setAuthor(""); setDepartmentId(""); setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      await startIngest(book.id);
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
                  {b.status === "error" && b.error_message && <div className="text-xs text-destructive mt-1">{b.error_message}</div>}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${st.cls}`}>{st.label}</span>
                {(b.status === "error" || b.status === "pending") && (
                  <button onClick={() => startIngest(b.id)} title="Qayta o'qish" className="p-1.5 rounded-lg text-foreground hover:bg-secondary"><RefreshCw className="w-4 h-4" /></button>
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
