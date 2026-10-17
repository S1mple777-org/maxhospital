import { describe, expect, it, vi } from "vitest";
import { retrieveBookSources } from "../../supabase/functions/_shared/book-retrieval";

describe("book retrieval availability", () => {
  it("does not call embeddings when no books are ready", async () => {
    const search = vi.fn();
    const sources = await retrieveBookSources({ hasReadyBooks: async () => false, search, onError: vi.fn() });
    expect(sources).toEqual([]);
    expect(search).not.toHaveBeenCalled();
  });

  it("returns no invented sources when retrieval fails", async () => {
    const onError = vi.fn();
    const failure = new Error("Embedding service unavailable");
    const sources = await retrieveBookSources({
      hasReadyBooks: async () => true,
      search: async () => { throw failure; },
      onError,
    });
    expect(sources).toEqual([]);
    expect(onError).toHaveBeenCalledWith(failure);
  });

  it("preserves retrieved passages and their real page numbers", async () => {
    const passage = { book_title: "Medical reference", book_author: null, page_number: 42, content: "Reference passage", similarity: 0.8 };
    const sources = await retrieveBookSources({ hasReadyBooks: async () => true, search: async () => [passage], onError: vi.fn() });
    expect(sources).toEqual([passage]);
  });
});