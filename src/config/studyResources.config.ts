export interface ApprovedStudyBook {
  id: string;
  title: string;
  author: string;
  publisher: string;
}

const BOOKS: Record<string, ApprovedStudyBook> = {
  egiu5: {
    id: 'egiu5',
    title: 'English Grammar in Use (5th Edition)',
    author: 'Raymond Murphy',
    publisher: 'Cambridge University Press',
  },
  agiu3: {
    id: 'agiu3',
    title: 'Advanced Grammar in Use (3rd Edition)',
    author: 'Martin Hewings',
    publisher: 'Cambridge University Press',
  },
  eviuIntermediate: {
    id: 'eviu-intermediate',
    title: 'English Vocabulary in Use (Pre-intermediate & Intermediate)',
    author: 'Stuart Redman',
    publisher: 'Cambridge University Press',
  },
  eviuUpper: {
    id: 'eviu-upper',
    title: 'English Vocabulary in Use (Upper-intermediate)',
    author: "Michael McCarthy & Felicity O'Dell",
    publisher: 'Cambridge University Press',
  },
  cambridgeIelts: {
    id: 'cambridge-ielts',
    title: 'Cambridge IELTS Practice Tests (Books 14-19)',
    author: 'Cambridge',
    publisher: 'Cambridge University Press',
  },
  officialGuide: {
    id: 'official-cambridge-guide',
    title: 'The Official Cambridge Guide to IELTS',
    author: 'Pauline Cullen & Amanda French',
    publisher: 'Cambridge University Press',
  },
  grammarForIelts: {
    id: 'grammar-for-ielts',
    title: 'Grammar for IELTS',
    author: 'Diana Hopkins',
    publisher: 'Cambridge University Press',
  },
  vocabularyForIelts: {
    id: 'vocabulary-for-ielts',
    title: 'Vocabulary for IELTS (Intermediate & Advanced)',
    author: 'Pauline Cullen',
    publisher: 'Cambridge University Press',
  },
  awl: {
    id: 'awl',
    title: 'Academic Word List (AWL Sublists 1-10)',
    author: 'Averil Coxhead',
    publisher: 'Victoria University of Wellington',
  },
};

export const APPROVED_STUDY_BOOKS: readonly ApprovedStudyBook[] = Object.freeze(Object.values(BOOKS));

export function findApprovedStudyBook(bookTitle: string, author: string): ApprovedStudyBook | null {
  const normalizedTitle = String(bookTitle || '').trim();
  const normalizedAuthor = String(author || '').trim();

  if (!normalizedTitle || !normalizedAuthor) {
    return null;
  }

  return APPROVED_STUDY_BOOKS.find(
    (book) => book.title === normalizedTitle && book.author === normalizedAuthor,
  ) || null;
}

export function formatApprovedStudyBooksForPrompt(): string {
  return APPROVED_STUDY_BOOKS
    .map((book, index) => `${index + 1}. "${book.title}" — ${book.author} (${book.publisher})`)
    .join('\n');
}
