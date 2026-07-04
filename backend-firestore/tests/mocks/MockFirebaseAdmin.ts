export class MockFirebaseAdmin {
  static async verifyIdToken(token: string) {
    if (token === 'valid_mock_token') {
      return { uid: 'mock_user_1', email: 'test@example.com' };
    }
    if (token === 'valid_mock_token_2') {
      return { uid: 'mock_user_2', email: 'other@example.com' };
    }
    throw new Error('Unauthorized');
  }
}
