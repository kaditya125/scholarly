export interface Flashcard {
  id: string;
  front: string;
  back: string;
  createdAt: number;
}

export function getFlashcards(): Flashcard[] {
  try {
    const data = localStorage.getItem('my_flashcards');
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export function addFlashcard(card: Omit<Flashcard, 'id' | 'createdAt'>) {
  const cards = getFlashcards();
  const newCard = {
    ...card,
    id: Math.random().toString(36).substr(2, 9),
    createdAt: Date.now()
  };
  cards.push(newCard);
  localStorage.setItem('my_flashcards', JSON.stringify(cards));
  return newCard;
}

export function deleteFlashcard(id: string) {
  const cards = getFlashcards();
  const newCards = cards.filter(c => c.id !== id);
  localStorage.setItem('my_flashcards', JSON.stringify(newCards));
}
