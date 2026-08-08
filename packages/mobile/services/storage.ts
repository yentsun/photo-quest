import * as SQLite from 'expo-sqlite';
import { CREATE_MEDIA_TABLE, CREATE_FOLDERS_TABLE } from '@photo-quest/shared/schema';

let db: SQLite.SQLiteDatabase | null = null;

export function getDb(): SQLite.SQLiteDatabase {
  if (!db) {
    db = SQLite.openDatabaseSync('photoquest.db');
    db.execAsync('PRAGMA journal_mode = WAL');
    db.execAsync(CREATE_MEDIA_TABLE);
    db.execAsync(CREATE_FOLDERS_TABLE);
  }
  return db;
}

export async function cacheMedia(item: any) {
  const database = getDb();
  await database.runAsync(
    `INSERT OR REPLACE INTO media (id, path, title, type, folder, duration, width, height, codec, status, transcoded_path, size, likes, hidden, hash, orientation, camera, date_taken, thumbnail_time, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    item.id, item.path, item.title, item.type, item.folder, item.duration, item.width, item.height, item.codec,
    item.status, item.transcoded_path, item.size, item.likes, item.hidden, item.hash, item.orientation,
    item.camera, item.date_taken, item.thumbnail_time, item.created_at, item.updated_at
  );
}

export async function cacheManyMedia(items: any[]) {
  const database = getDb();
  for (const item of items) {
    await cacheMedia(item);
  }
}

export async function getCachedMediaById(id: number): Promise<any | null> {
  const database = getDb();
  const row = await database.getFirstAsync('SELECT * FROM media WHERE id = ?', id);
  return row ?? null;
}

export async function deleteCachedMedia(id: number) {
  const database = getDb();
  await database.runAsync('DELETE FROM media WHERE id = ?', id);
}
