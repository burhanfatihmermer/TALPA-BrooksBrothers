import sqlite3 from 'sqlite3';
import path from 'path';

const dbPath = path.resolve(process.cwd(), 'database.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Veritabanı bağlantı hatası:', err.message);
    } else {
        console.log('Veritabanına bağlanıldı.');
    }
});

export function initializeDatabase(): Promise<void> {
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            db.run(`
                CREATE TABLE IF NOT EXISTS Users (
                    tc_no TEXT PRIMARY KEY,
                    claimed_codes_count INTEGER DEFAULT 0
                )
            `, () => {
                // Hata verirse sütun zaten var demektir, görmezden geliyoruz.
                db.run(`ALTER TABLE Users ADD COLUMN is_debtor BOOLEAN DEFAULT 0`, () => {});
            });

            db.run(`
                CREATE TABLE IF NOT EXISTS Codes (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    code TEXT UNIQUE NOT NULL,
                    is_used BOOLEAN DEFAULT 0,
                    assigned_to_tc TEXT
                )
            `);

            db.run(`
                CREATE TABLE IF NOT EXISTS Settings (
                    key TEXT PRIMARY KEY,
                    value TEXT
                )
            `, (err) => {
                if (err) return reject(err);
                
                db.get(`SELECT * FROM Settings WHERE key = 'max_codes_per_user'`, (err, row) => {
                    if (!row) {
                        db.run(`INSERT INTO Settings (key, value) VALUES ('max_codes_per_user', '1')`, (err2) => {
                            if (err2) reject(err2);
                            else resolve();
                        });
                    } else {
                        resolve();
                    }
                });
            });
        });
    });
}

export function dbGet(query: string, params: any[] = []): Promise<any> {
    return new Promise((resolve, reject) => {
        db.get(query, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
}

export function dbAll(query: string, params: any[] = []): Promise<any[]> {
    return new Promise((resolve, reject) => {
        db.all(query, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

export function dbRun(query: string, params: any[] = []): Promise<void> {
    return new Promise((resolve, reject) => {
        db.run(query, params, function (err) {
            if (err) reject(err);
            else resolve();
        });
    });
}

export default db;
