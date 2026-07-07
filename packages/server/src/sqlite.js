let Database;
let usingBun = false;

if (typeof Bun !== 'undefined') {
  const { Database: BunDB } = require('bun:sqlite');
  Database = BunDB;
  usingBun = true;
} else {
  Database = require('better-sqlite3');
}

export function isUsingBun() {
  return usingBun;
}

export function openDb(path) {
  const db = new Database(path);
  return db;
}

export { Database };
