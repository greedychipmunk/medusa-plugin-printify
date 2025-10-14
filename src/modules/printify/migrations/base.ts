/**
 * Migration framework for Medusa Printify Plugin
 * 
 * This module provides utilities for managing database schema changes
 * and migrations within the Medusa ecosystem.
 */

export interface MigrationOptions {
  name: string;
  timestamp: number;
  description: string;
}

export interface Migration {
  up: () => Promise<void>;
  down: () => Promise<void>;
  options: MigrationOptions;
}

/**
 * Base migration class for Printify plugin schema changes
 */
export abstract class BaseMigration implements Migration {
  public readonly options: MigrationOptions;

  constructor(options: MigrationOptions) {
    this.options = options;
  }

  abstract up(): Promise<void>;
  abstract down(): Promise<void>;

  /**
   * Generate a timestamp for migration ordering
   */
  static generateTimestamp(): number {
    return Date.now();
  }

  /**
   * Create a migration name with timestamp prefix
   */
  static createMigrationName(description: string): string {
    const timestamp = this.generateTimestamp();
    const cleanDescription = description
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    
    return `${timestamp}-${cleanDescription}`;
  }
}

/**
 * Migration registry for tracking applied migrations
 */
export class MigrationRegistry {
  private migrations: Map<string, Migration> = new Map();
  private appliedMigrations: Set<string> = new Set();

  /**
   * Register a migration
   */
  register(migration: Migration): void {
    const key = `${migration.options.timestamp}-${migration.options.name}`;
    this.migrations.set(key, migration);
  }

  /**
   * Get all registered migrations in timestamp order
   */
  getMigrations(): Migration[] {
    return Array.from(this.migrations.values())
      .sort((a, b) => a.options.timestamp - b.options.timestamp);
  }

  /**
   * Mark a migration as applied
   */
  markApplied(migration: Migration): void {
    const key = `${migration.options.timestamp}-${migration.options.name}`;
    this.appliedMigrations.add(key);
  }

  /**
   * Check if a migration has been applied
   */
  isApplied(migration: Migration): boolean {
    const key = `${migration.options.timestamp}-${migration.options.name}`;
    return this.appliedMigrations.has(key);
  }

  /**
   * Get pending migrations (not yet applied)
   */
  getPendingMigrations(): Migration[] {
    return this.getMigrations().filter(migration => !this.isApplied(migration));
  }
}

// Global migration registry
export const migrationRegistry = new MigrationRegistry();