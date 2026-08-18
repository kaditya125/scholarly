import { NotificationValidator, NotificationFactory } from '../NotificationEngine';
import { z } from 'zod';

describe('NotificationEngine', () => {
  describe('NotificationFactory', () => {
    it('should create a valid learning alert', () => {
      const payload = NotificationFactory.createLearningAlert(
        'user-123',
        'Quiz Ready',
        'Your quiz is ready to take.',
        'https://app.sadhya.com/quiz/1'
      );
      expect(payload.userId).toBe('user-123');
      expect(payload.category).toBe('learning');
      expect(payload.type).toBe('learning.alert');
      expect(payload.title).toBe('Quiz Ready');
      expect(payload.body).toBe('Your quiz is ready to take.');
      expect(payload.actionUrl).toBe('https://app.sadhya.com/quiz/1');
    });

    it('should create a valid security alert', () => {
      const payload = NotificationFactory.createSecurityAlert(
        'user-456',
        'New Login',
        'A new login was detected from Chrome on Mac.'
      );
      expect(payload.userId).toBe('user-456');
      expect(payload.category).toBe('security');
      expect(payload.type).toBe('security.alert');
      expect(payload.priority).toBe('critical');
    });
  });

  describe('NotificationValidator', () => {
    it('should pass validation for a well-formed payload', () => {
      const validPayload = {
        userId: 'user-789',
        category: 'social',
        type: 'social.comment',
        title: 'New Comment',
        body: 'Someone commented on your notebook',
        priority: 'low'
      };
      expect(() => NotificationValidator.validate(validPayload)).not.toThrow();
    });

    it('should throw an error for an invalid category', () => {
      const invalidPayload = {
        userId: 'user-789',
        category: 'invalid-category', // this should fail
        type: 'social.comment',
        title: 'New Comment',
        body: 'Someone commented on your notebook'
      };
      expect(() => NotificationValidator.validate(invalidPayload)).toThrow(z.ZodError);
    });

    it('should throw an error if missing required fields', () => {
      const missingPayload = {
        userId: 'user-789',
        category: 'social',
        // missing type, title, body
      };
      expect(() => NotificationValidator.validate(missingPayload)).toThrow(z.ZodError);
    });
  });
});
