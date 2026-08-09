import { isGreetingMessage } from '../../src/config/prompts';

describe('isGreetingMessage', () => {
  it('matches bare greetings', () => {
    for (const g of ['hi', 'hello', 'hey', 'yo', 'sup', 'howdy', 'namaste', 'good morning', 'good evening']) {
      expect(isGreetingMessage(g)).toBe(true);
    }
  });

  it('matches greetings with trailing social filler (the regression that ran the full pipeline)', () => {
    for (const g of ['hi there!', 'hey there', 'hello there', 'hi everyone', 'hey buddy', 'hello friends', 'hi again', 'thanks so much']) {
      expect(isGreetingMessage(g)).toBe(true);
    }
  });

  it('matches farewells and thanks', () => {
    for (const g of ['bye', 'goodbye', 'see you', 'thanks', 'thank you', 'ok thanks', 'take care']) {
      expect(isGreetingMessage(g)).toBe(true);
    }
  });

  it('does NOT match real educational queries', () => {
    for (const q of [
      'hi, explain osmosis',
      'what is photosynthesis',
      'hey can you solve this problem',
      'hello world program in python',
      'compare mitosis and meiosis',
      'good question about entropy',
    ]) {
      expect(isGreetingMessage(q)).toBe(false);
    }
  });
});
