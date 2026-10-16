// Admin-only: extracts text from an uploaded PDF book, splits it into chunks,
// embeds each chunk with Gemini and stores the vectors for the AI assistant.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { extractText, getDocumentProxy } from "npm:unpdf@1";
import { corsHeaders, getUser, isStaff, json, serviceClient } from "../_shared/http.ts";
import { chunkPages } from "../_shared/medical-ai.ts";
import { embedTexts, toPgVector } from "../_shared/gemini.ts";

const MAX_CHUNKS = 3000;

async function processBook(bookId: string) {
  const db = serviceClient();
  const setStatus = (fields: Record<string, unknown>) =>
    db.from("medical_books").update(fields).eq("id", bookId);

  try {
    const { data: book, error } = await db.from("medical_books").select("*").eq("id", bookId).single();
    if (error || !book) throw new Error("Kitob topilmadi");

    const { data: file, error: dlError } = await db.storage.from("medical-books").download(book.storage_path);
    if (dlError || !file) throw new Error("PDF faylni yuklab bo'lmadi");

    const pdf = await getDocumentProxy(new Uint8Array(await file.arrayBuffer()));
    const { totalPages, text } = await extractText(pdf, { mergePages: false });
    const pages = Array.isArray(text) ? text : [text];

    const chunks = chunkPages(pages);
    if (chunks.length === 0) {
      throw new Error("PDF ichida matn topilmadi (skanerlangan rasm bo'lishi mumkin). Matnli PDF yuklang.");
    }
    if (chunks.length > MAX_CHUNKS) {
      throw new Error(`Kitob juda katta (${chunks.length} bo'lak). Uni qismlarga bo'lib yuklang.`);
    }

    await db.from("book_chunks").delete().eq("book_id", bookId);

    const BATCH = 50;
    for (let i = 0; i < chunks.length; i += BATCH) {
      const part = chunks.slice(i, i + BATCH);
      // The book title gives each chunk context, which improves retrieval.
      const vectors = await embedTexts(part.map((c) => `${book.title}\n${c.content}`), "RETRIEVAL_DOCUMENT");
      const { error: insError } = await db.from("book_chunks").insert(
        part.map((c, j) => ({
          book_id: bookId,
          chunk_index: i + j,
          page_number: c.page,
          content: c.content,
          embedding: toPgVector(vectors[j]),
        })),
      );
      if (insError) throw new Error(insError.message);
    }

    await setStatus({ status: "ready", error_message: null, page_count: totalPages, chunk_count: chunks.length });
  } catch (e) {
    console.error("ingest-book failed", bookId, e);
    await db.from("book_chunks").delete().eq("book_id", bookId);
    await setStatus({ status: "error", error_message: String((e as Error)?.message ?? e).slice(0, 500), chunk_count: 0 });
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const db = serviceClient();
  const user = await getUser(req, db);
  if (!user) return json({ error: "Avval tizimga kiring" }, 401);
  if (!(await isStaff(db, user.id))) return json({ error: "Faqat admin uchun" }, 403);

  const { book_id } = await req.json().catch(() => ({}));
  if (typeof book_id !== "string") return json({ error: "book_id kerak" }, 400);

  const { data: book } = await db.from("medical_books").select("id, status").eq("id", book_id).maybeSingle();
  if (!book) return json({ error: "Kitob topilmadi" }, 404);
  if (book.status === "processing") return json({ status: "processing" }, 202);

  await db.from("medical_books").update({ status: "processing", error_message: null }).eq("id", book_id);

  // Large books take a while: keep working after the response is sent.
  EdgeRuntime.waitUntil(processBook(book_id));
  return json({ status: "processing" }, 202);
});
