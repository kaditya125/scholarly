/**
 * MetadataCategoryRegistry
 * Phase 2D: Configurable Educational Metadata Category System
 *
 * Provides a registry of metadata categories that can be registered,
 * extended, and queried at runtime — without any hardcoded category lists
 * in the core architecture.
 *
 * Default categories cover common Indian educational taxonomy:
 * subject, class, board, exam, language, chapter, topic, difficulty,
 * content_type, keywords — but these are just defaults, not constraints.
 */

import { MetadataCategory } from '../types';

const DEFAULT_CATEGORIES: MetadataCategory[] = [
  {
    key: 'subject',
    label: 'Subject',
    valueType: 'string',
  },
  {
    key: 'class',
    label: 'Class / Grade',
    valueType: 'string',
  },
  {
    key: 'board',
    label: 'Education Board',
    valueType: 'string',
  },
  {
    key: 'exam',
    label: 'Target Exam',
    valueType: 'string',
  },
  {
    key: 'language',
    label: 'Language',
    valueType: 'string',
  },
  {
    key: 'chapter',
    label: 'Chapter',
    valueType: 'string',
  },
  {
    key: 'topic',
    label: 'Topic / Concept',
    valueType: 'string',
  },
  {
    key: 'difficulty',
    label: 'Difficulty Level',
    valueType: 'string',
    allowedValues: ['beginner', 'intermediate', 'advanced', 'mixed'],
  },
  {
    key: 'content_type',
    label: 'Content Type',
    valueType: 'string',
    allowedValues: ['textbook', 'notes', 'question_bank', 'reference', 'worksheet', 'mixed'],
  },
  {
    key: 'keywords',
    label: 'Keywords',
    valueType: 'string[]',
  },
];

export class MetadataCategoryRegistry {
  private categories: Map<string, MetadataCategory> = new Map();

  constructor(initialCategories: MetadataCategory[] = DEFAULT_CATEGORIES) {
    for (const cat of initialCategories) {
      this.categories.set(cat.key, cat);
    }
  }

  /** Register a new category or update an existing one */
  register(category: MetadataCategory): void {
    this.categories.set(category.key, category);
  }

  /** Remove a category by key */
  unregister(key: string): void {
    this.categories.delete(key);
  }

  /** Get a category descriptor by key */
  get(key: string): MetadataCategory | undefined {
    return this.categories.get(key);
  }

  /** Get all registered categories */
  getAll(): MetadataCategory[] {
    return Array.from(this.categories.values());
  }

  /** Get all category keys */
  getKeys(): string[] {
    return Array.from(this.categories.keys());
  }

  /** Check whether a key is registered */
  has(key: string): boolean {
    return this.categories.has(key);
  }

  /**
   * Validate a metadata value against the registered category constraints.
   * Returns true if valid (or if no allowedValues constraint is set).
   */
  validate(key: string, value: string | string[] | number): boolean {
    const cat = this.categories.get(key);
    if (!cat) return false;
    if (!cat.allowedValues || cat.allowedValues.length === 0) return true;

    const checkValue = (v: string) =>
      cat.allowedValues!.some(a => a.toLowerCase() === v.toLowerCase());

    if (Array.isArray(value)) {
      return value.every(v => checkValue(String(v)));
    }
    return checkValue(String(value));
  }
}

/** Singleton default registry — callers can pass custom registries for isolation */
export const defaultMetadataCategoryRegistry = new MetadataCategoryRegistry();
