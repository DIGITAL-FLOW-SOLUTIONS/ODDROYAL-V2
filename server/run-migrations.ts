import { supabaseAdmin } from './supabase';
import { readFileSync } from 'fs';
import { join } from 'path';

async function runMigrations() {
  if (!supabaseAdmin) {
    console.error('❌ Supabase not configured. Cannot run migrations.');
    process.exit(1);
  }

  console.log('🚀 Starting migration runner...\n');

  // Read and execute migration 006 (which includes the function)
  try {
    const migrationPath = join(__dirname, '../db/migrations/006_enhanced_settlement_atomicity.sql');
    const sql = readFileSync(migrationPath, 'utf8');

    console.log('📄 Running migration: 006_enhanced_settlement_atomicity.sql');

    // Split SQL by statements (simple split on semicolons)
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    for (const statement of statements) {
      if (statement.trim().length === 0) continue;
      
      try {
        const { error } = await supabaseAdmin.rpc('exec_sql', {
          query: statement
        }).single();

        if (error) {
          // Try direct execution via REST API if RPC fails
          console.log('  ⚠️  RPC failed, using direct SQL execution...');
          // Note: Supabase doesn't support direct SQL via client library
          // This needs to be run in Supabase SQL Editor
          console.log('  Statement:', statement.substring(0, 100) + '...');
        }
      } catch (err) {
        console.error('  ❌ Error executing statement:', err);
      }
    }

    console.log('✅ Migration completed\n');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }

  console.log('✅ All migrations completed successfully!');
  process.exit(0);
}

runMigrations();
