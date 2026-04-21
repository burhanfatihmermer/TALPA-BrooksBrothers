import express from 'express';
import cors from 'cors';
import { initializeDatabase, dbGet, dbAll, dbRun, default as db } from './database';

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// INIT
initializeDatabase().then(() => {
    console.log('Veritabanı tabloları hazır.');
}).catch(err => {
    console.error('Veritabanı başlatılamadı:', err);
});

// GET Settings
app.get('/api/admin/settings', async (req, res) => {
    try {
        const result = await dbGet(`SELECT value FROM Settings WHERE key = 'max_codes_per_user'`);
        res.json({ maxCodesPerUser: parseInt(result?.value || '1', 10) });
    } catch (err) {
        res.status(500).json({ error: 'Ayar alınamadı' });
    }
});

// PUT Settings
app.put('/api/admin/settings', async (req, res) => {
    const { maxCodesPerUser } = req.body;
    try {
        await dbRun(`UPDATE Settings SET value = ? WHERE key = 'max_codes_per_user'`, [maxCodesPerUser.toString()]);
        res.json({ success: true, maxCodesPerUser });
    } catch (err) {
        res.status(500).json({ error: 'Ayar güncellenemedi' });
    }
});

// GET Stats
app.get('/api/admin/stats', async (req, res) => {
    try {
        const totalUsers = await dbGet(`SELECT COUNT(*) as count FROM Users`);
        const totalCodes = await dbGet(`SELECT COUNT(*) as count FROM Codes`);
        const usedCodes = await dbGet(`SELECT COUNT(*) as count FROM Codes WHERE is_used = 1`);
        
        res.json({
            usersCount: totalUsers.count,
            totalCodes: totalCodes.count,
            usedCodes: usedCodes.count,
            remainingCodes: totalCodes.count - usedCodes.count
        });
    } catch (err) {
        res.status(500).json({ error: 'İstatistikler alınamadı' });
    }
});

// BULK insert users (Regular)
app.post('/api/admin/users/bulk', async (req, res) => {
    const { users } = req.body; 
    if (!users || !Array.isArray(users)) {
        return res.status(400).json({ error: 'Geçersiz veri formatı' });
    }

    try {
        db.serialize(() => {
            db.run("BEGIN TRANSACTION");
            const stmt = db.prepare(`INSERT OR IGNORE INTO Users (tc_no, claimed_codes_count, is_debtor) VALUES (?, 0, 0)`);
            users.forEach(tc => {
                stmt.run(tc);
            });
            stmt.finalize();
            db.run("COMMIT", () => {
                 res.json({ success: true, count: users.length });
            });
        });
    } catch (err) {
        res.status(500).json({ error: 'Kullanıcılar eklenemedi' });
    }
});

// BULK insert users (Debtors)
app.post('/api/admin/users/debtors/bulk', async (req, res) => {
    const { users } = req.body; 
    if (!users || !Array.isArray(users)) {
        return res.status(400).json({ error: 'Geçersiz veri formatı' });
    }

    try {
        db.serialize(() => {
            db.run("BEGIN TRANSACTION");
            const stmtInsert = db.prepare(`INSERT OR IGNORE INTO Users (tc_no, claimed_codes_count, is_debtor) VALUES (?, 0, 1)`);
            const stmtUpdate = db.prepare(`UPDATE Users SET is_debtor = 1 WHERE tc_no = ?`);
            
            users.forEach(tc => {
                stmtInsert.run(tc);
                stmtUpdate.run(tc);
            });
            stmtInsert.finalize();
            stmtUpdate.finalize();
            db.run("COMMIT", () => {
                 res.json({ success: true, count: users.length });
            });
        });
    } catch (err) {
        res.status(500).json({ error: 'Borçlu üyeler eklenemedi' });
    }
});

// BULK insert codes
app.post('/api/admin/codes/bulk', async (req, res) => {
    const { codes } = req.body; 
    if (!codes || !Array.isArray(codes)) {
        return res.status(400).json({ error: 'Geçersiz veri formatı' });
    }

    try {
        db.serialize(() => {
            db.run("BEGIN TRANSACTION");
            const stmt = db.prepare(`INSERT OR IGNORE INTO Codes (code, is_used) VALUES (?, 0)`);
            codes.forEach(c => {
                stmt.run(c);
            });
            stmt.finalize();
            db.run("COMMIT", () => {
                res.json({ success: true, count: codes.length });
            });
        });
    } catch (err) {
        res.status(500).json({ error: 'Kodlar eklenemedi' });
    }
});

// DELETE All Data (DANGER)
app.delete('/api/admin/reset', async (req, res) => {
    try {
         await dbRun(`DELETE FROM Codes`);
         await dbRun(`DELETE FROM Users`);
         await dbRun(`UPDATE Settings SET value = '1' WHERE key = 'max_codes_per_user'`);
         res.json({ success: true });
    } catch (error) {
         res.status(500).json({ error: 'Sıfırlama başarısız' });
    }
});

// USER: Claim a Code
app.post('/api/claim-code', (req, res) => {
    const { tc_no } = req.body;

    if (!tc_no || typeof tc_no !== 'string') {
        return res.status(400).json({ error: 'Geçerli bir T.C. Kimlik Numarası girin.' });
    }

    db.serialize(() => {
        db.run("BEGIN EXCLUSIVE TRANSACTION");

        // 1. TCKN kontrol
        db.get(`SELECT * FROM Users WHERE tc_no = ?`, [tc_no], (err, user: any) => {
            if (err) {
                db.run("ROLLBACK");
                return res.status(500).json({ error: 'Sistem hatası (Kullanıcı doğrulaması).' });
            }
            
            if (!user) {
                db.run("ROLLBACK");
                return res.status(404).json({ error: 'TALPA üyelik kaydınıza ulaşılamamıştır.' });
            }

            // Borçlu üye kontrolü
            if (user.is_debtor) {
                db.run("ROLLBACK");
                return res.status(403).json({ error: 'Dernek aidat borçlarınız sebebiyle, kampanya katılımınız sınırlandırılmıştır. Lütfen muhasebe birimi ile iletişime geçiniz.' });
            }

            // 2. Limit kontrol ve Onceden alinmis kodları bulma
            db.get(`SELECT value FROM Settings WHERE key = 'max_codes_per_user'`, [], (err, setting: any) => {
                if (err) {
                    db.run("ROLLBACK");
                    return res.status(500).json({ error: 'Sistem hatası (Limit doğrulama).' });
                }

                const maxCodes = parseInt(setting.value || '1', 10);
                
                db.all(`SELECT code FROM Codes WHERE assigned_to_tc = ? ORDER BY id ASC`, [tc_no], (err, rows: any[]) => {
                    if (err) {
                        db.run("ROLLBACK");
                        return res.status(500).json({ error: 'Sistem hatası (Geçmiş kodlar).' });
                    }
                    
                    const pastCodes = rows.map(r => r.code);

                    if (user.claimed_codes_count >= maxCodes) {
                        db.run("ROLLBACK");
                        return res.json({ 
                            success: true, 
                            limitReached: true,
                            pastCodes: pastCodes,
                            message: 'Kampanya katılım limitinize ulaştınız. Görüntülenen kodlar daha önce almış olduğunuz kodlardır.' 
                        });
                    }

                    // 3. Müsait kod çek
                    db.get(`SELECT * FROM Codes WHERE is_used = 0 LIMIT 1`, [], (err, codeRow: any) => {
                        if (err) {
                            db.run("ROLLBACK");
                            return res.status(500).json({ error: 'Sistem hatası (Kod doğrulama).' });
                        }
                        if (!codeRow) {
                            db.run("ROLLBACK");
                            return res.status(404).json({ error: 'Dağıtılacak kampanya kodu kalmadı!' });
                        }

                        // 4. Kodu ata
                        db.run(`UPDATE Codes SET is_used = 1, assigned_to_tc = ? WHERE id = ?`, [tc_no, codeRow.id], (err) => {
                            if (err) {
                                db.run("ROLLBACK");
                                return res.status(500).json({ error: 'Sistem hatası (Güncelleme).' });
                            }

                            // 5. Kullanıcının limit sayacını artır
                            db.run(`UPDATE Users SET claimed_codes_count = claimed_codes_count + 1 WHERE tc_no = ?`, [tc_no], (err) => {
                                if (err) {
                                    db.run("ROLLBACK");
                                    return res.status(500).json({ error: 'Sistem hatası (Kullanıcı güncelleme).' });
                                }

                                db.run("COMMIT", (err) => {
                                    if (err) {
                                        db.run("ROLLBACK");
                                        return res.status(500).json({ error: 'Sistem hatası (Transaction).' });
                                    }
                                    
                                    res.json({ 
                                        success: true, 
                                        limitReached: false,
                                        code: codeRow.code,
                                        pastCodes: pastCodes,
                                        message: 'Üye doğrulama başarılı! Kampanya kodunuz teslim edildi.'
                                    });
                                });
                            });
                        });
                    });
                });
            });
        });
    });
});

// GET UYELER LISTESI (ONIZLEME)
app.get('/api/admin/users', async (req, res) => {
    try {
        const users = await dbAll(`SELECT tc_no, claimed_codes_count, is_debtor FROM Users ORDER BY tc_no`);
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: 'Kullanıcı verileri alınamadı' });
    }
});

// GET KODLAR LISTESI (ONIZLEME)
app.get('/api/admin/codes', async (req, res) => {
    try {
        const codes = await dbAll(`SELECT id, code, is_used, assigned_to_tc FROM Codes ORDER BY id DESC`);
        res.json(codes);
    } catch (err) {
        res.status(500).json({ error: 'Kod verileri alınamadı' });
    }
});


// SEARCH user
app.post('/api/admin/users/search', async (req, res) => {
    const { tc_no } = req.body;
    try {
        const user = await dbGet(`SELECT tc_no, claimed_codes_count, is_debtor FROM Users WHERE tc_no = ?`, [tc_no]);
        if (!user) return res.status(404).json({ error: 'Kayıt bulunamadı' });
        res.json(user);
    } catch (err) {
        res.status(500).json({ error: 'Arama başarısız' });
    }
});

// SINGLE insert user
app.post('/api/admin/users/single', async (req, res) => {
    const { tc_no, is_debtor } = req.body;
    if (!tc_no || typeof tc_no !== 'string') return res.status(400).json({ error: 'Geçersiz TCKN' });
    const debtorVal = is_debtor ? 1 : 0;
    try {
        await dbRun(`INSERT INTO Users (tc_no, claimed_codes_count, is_debtor) VALUES (?, 0, ?) ON CONFLICT(tc_no) DO UPDATE SET is_debtor = ?`, [tc_no, debtorVal, debtorVal]);
        res.json({ success: true, tc_no, is_debtor: debtorVal });
    } catch (err) {
        res.status(500).json({ error: 'Kullanıcı eklenemedi' });
    }
});

// UPDATE user status
app.put('/api/admin/users/status', async (req, res) => {
    const { tc_no, is_debtor } = req.body;
    if (!tc_no || typeof tc_no !== 'string') return res.status(400).json({ error: 'Geçersiz TCKN' });
    const debtorVal = is_debtor ? 1 : 0;
    try {
        const exist = await dbGet(`SELECT tc_no FROM Users WHERE tc_no = ?`, [tc_no]);
        if (!exist) return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
        await dbRun(`UPDATE Users SET is_debtor = ? WHERE tc_no = ?`, [debtorVal, tc_no]);
        res.json({ success: true, tc_no, is_debtor: debtorVal });
    } catch (err) {
        res.status(500).json({ error: 'Statü güncellenemedi' });
    }
});

app.listen(PORT, () => {
    console.log(`API Sunucusu http://localhost:${PORT} adresinde çalışıyor.`);
});
