// Admin-only: stores an uploaded medical book for the AI assistant.
//
// The browser extracts the PDF text page by page and sends it here in small batches
// ({ book_id, pages, first_page, reset, done, total_pages }). Each call only splits its
// pages into chunks, embeds them with Gemini and saves the vectors, so it stays well
// inside the edge function CPU and time limits. (Parsing a whole 400-page PDF here used
// to get the function killed silently, leaving the book stuck on "processing".)
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, getUser, isStaff, json, serviceClient } from "../_shared/http.ts";
import { chunkPages } from "../_shared/medical-ai.ts";
import { embedTexts, toPgVector } from "../_shared/gemini.ts";

const MAX_CHUNKS = 3000;
const MAX_PAGES_PER_CALL = 40;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const db = serviceClient();
  const user = await getUser(req, db);
  if (!user) return json({ error: "Avval tizimga kiring" }, 401);
  if (!(await isStaff(db, user.id))) return json({ error: "Faqat admin uchun" }, 403);

  const body = await req.json().catch(() => ({}));
  const { book_id, pages, first_page, reset, done, total_pages } = body ?? {};
  if (typeof book_id !== "string") return json({ error: "book_id kerak" }, 400);
  if (!Array.isArray(pages) || pages.length > MAX_PAGES_PER_CALL || pages.some((p) => typeof p !== "string")) {
    return json({ error: `pages: 0..${MAX_PAGES_PER_CALL} ta matn kerak. Sahifani yangilab, qayta urinib ko'ring.` }, 400);
  }
  const firstPage = Number.isInteger(first_page) && first_page > 0 ? first_page : 1;

  const { data: book } = await db.from("medical_books").select("id, title").eq("id", book_id).maybeSingle();
  if (!book) return json({ error: "Kitob topilmadi" }, 404);

  const fail = async (message: string, status = 500) => {
    await db.from("book_chunks").delete().eq("book_id", book_id);
    await db.from("medical_books").update({ status: "error", error_message: message.slice(0, 500), chunk_count: 0 }).eq("id", book_id);
    return json({ error: message }, status);
  };

  try {
    if (reset) {
      await db.from("book_chunks").delete().eq("book_id", book_id);
      await db.from("medical_books").update({ status: "processing", error_message: null, chunk_count: 0 }).eq("id", book_id);
    }

    const chunks = chunkPages(pages as string[]).map((c) => ({ ...c, page: c.page + firstPage - 1 }));
    if (chunks.length > 0) {
      const { count: already } = await db.from("book_chunks").select("id", { count: "exact", head: true }).eq("book_id", book_id);
      const start = already ?? 0;
      if (start + chunks.length > MAX_CHUNKS) {
        return await fail(`Kitob juda katta (${MAX_CHUNKS} bo'lakdan ko'p). Uni qismlarga bo'lib yuklang.`, 400);
      }
      // The book title gives each chunk context, which improves retrieval.
      const vectors = await embedTexts(chunks.map((c) => `${book.title}\n${c.content}`), "RETRIEVAL_DOCUMENT", 0);
      const { error: insError } = await db.from("book_chunks").insert(
        chunks.map((c, j) => ({
          book_id,
          chunk_index: start + j,
          page_number: c.page,
          content: c.content,
          embedding: toPgVector(vectors[j]),
        })),
      );
      if (insError) throw new Error(insError.message);
    }

    if (done) {
      const { count } = await db.from("book_chunks").select("id", { count: "exact", head: true }).eq("book_id", book_id);
      if (!count) {
        return await fail("PDF ichida matn topilmadi (skanerlangan rasm bo'lishi mumkin). Matnli PDF yuklang.", 400);
      }
      await db.from("medical_books").update({
        status: "ready", error_message: null, chunk_count: count,
        page_count: Number.isInteger(total_pages) ? total_pages : null,
      }).eq("id", book_id);
      return json({ status: "ready", chunks: count });
    }
    return json({ status: "processing", added: chunks.length });
  } catch (e) {
    const message = String((e as Error)?.message ?? e);
    console.error("ingest-book failed", book_id, message);
    // Gemini quota: keep what is already saved, the browser waits and retries this batch.
    if (/Gemini 429/.test(message)) return json({ error: message, retry: true }, 429);
    return await fail(message);
  }
});
