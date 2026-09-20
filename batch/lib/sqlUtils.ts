/**
 * バッチ処理用 SQL ユーティリティ
 */

/**
 * SQLiteクエリ生成用に値を安全にエスケープ
 */
export function escapeSql(val: any): string {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') return Number.isFinite(val) ? String(val) : 'NULL';
  if (typeof val === 'boolean') return val ? '1' : '0';
  return `'${String(val).replace(/'/g, "''")}'`;
}
