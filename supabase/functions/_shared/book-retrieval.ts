export interface BookSource {
  book_title: string;
  book_author: string | null;
  page_number: number;
  content: string;
  similarity: number;
}

/** A missing/unavailable library must not block safe doctor routing. */
export async function retrieveBookSources(deps: {
  hasReadyBooks: () => Promise<boolean>;
  search: () => Promise<BookSource[]>;
  onError: (error: unknown) => void;
}): Promise<BookSource[]> {
  try {
    if (!(await deps.hasReadyBooks())) return [];
    return await deps.search();
  } catch (error) {
    deps.onError(error);
    return [];
  }
}