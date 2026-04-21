import express from 'express';
import cors from 'cors';
import { initializeDatabase, dbGet, dbAll, dbRun, default as pool } from './database.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Initialize DB (Useful for creating initial schemas once the backend runs)
initializeDatabase().then(() => {
    console.log('Veritabanı tabloları kontrol edildi.');
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
            usersCount: parseInt(totalUsers?.count || '0', 10),
            totalCodes: parseInt(totalCodes?.count || '0', 10),
            usedCodes: parseInt(usedCodes?.count || '0', 10),
            remainingCodes: parseInt(totalCodes?.count || '0', 10) - parseInt(usedCodes?.count || '0', 10)
        });
    } catch (err) {
        res.status(500).json({ error: 'İstatistikler alınamadı' });
    }
});

// BULK insert users (Regular)
app.post('/api/admin/users/bulk', async (req, res) => {
    const { users } = req.body; 
    if (!users || !Array.isArray(users)) return res.status(400).json({ error: 'Geçersiz veri formatı' });

    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        for (const tc of users) {
             await client.query(`INSERT INTO Users (tc_no, claimed_codes_count, is_debtor) VALUES ($1, 0, 0) ON CONFLICT (tc_no) DO NOTHING`, [tc]);
        }
        await client.query("COMMIT");
        res.json({ success: true, count: users.length });
    } catch (err) {
        await client.query("ROLLBACK");
        res.status(500).json({ error: 'Kullanıcılar eklenemedi' });
    } finally {
        client.release();
    }
});

// BULK insert users (Debtors)
app.post('/api/admin/users/debtors/bulk', async (req, res) => {
    const { users } = req.body; 
    if (!users || !Array.isArray(users)) return res.status(400).json({ error: 'Geçersiz veri formatı' });

    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        for (const tc of users) {
             await client.query(`INSERT INTO Users (tc_no, claimed_codes_count, is_debtor) VALUES ($1, 0, 1) ON CONFLICT (tc_no) DO UPDATE SET is_debtor = 1`, [tc]);
        }
        await client.query("COMMIT");
        res.json({ success: true, count: users.length });
    } catch (err) {
        await client.query("ROLLBACK");
        res.status(500).json({ error: 'Borçlu üyeler eklenemedi' });
    } finally {
        client.release();
    }
});

// BULK insert codes
app.post('/api/admin/codes/bulk', async (req, res) => {
    const { codes } = req.body; 
    if (!codes || !Array.isArray(codes)) return res.status(400).json({ error: 'Geçersiz veri formatı' });

    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        for (const c of codes) {
            await client.query(`INSERT INTO Codes (code, is_used) VALUES ($1, 0) ON CONFLICT (code) DO NOTHING`, [c]);
        }
        await client.query("COMMIT");
        res.json({ success: true, count: codes.length });
    } catch (err) {
        await client.query("ROLLBACK");
        res.status(500).json({ error: 'Kodlar eklenemedi' });
    } finally {
        client.release();
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

// CLAIM CODE
app.post('/api/claim-code', async (req, res) => {
    const { tc_no } = req.body;
    if (!tc_no || typeof tc_no !== 'string') return res.status(400).json({ error: 'Geçerli bir T.C. Kimlik Numarası girin.' });

    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        const userRes = await client.query(`SELECT * FROM Users WHERE tc_no = $1 FOR UPDATE`, [tc_no]);
        const user = userRes.rows[0];

        if (!user) {
            await client.query("ROLLBACK");
            return res.status(404).json({ error: 'TALPA üyelik kaydınıza ulaşılamamıştır.' });
        }

        if (user.is_debtor === 1 || user.is_debtor === true) {
            await client.query("ROLLBACK");
            return res.status(403).json({ error: 'Dernek aidat borçlarınız sebebiyle, kampanya katılımınız sınırlandırılmıştır. Lütfen muhasebe birimi ile iletişime geçiniz.' });
        }

        const limitRes = await client.query(`SELECT value FROM Settings WHERE key = 'max_codes_per_user'`);
        const maxCodes = parseInt(limitRes.rows[0]?.value || '1', 10);
        
        const pastRes = await client.query(`SELECT code FROM Codes WHERE assigned_to_tc = $1 ORDER BY id ASC`, [tc_no]);
        const pastCodes = pastRes.rows.map((r: any) => r.code);

        if (user.claimed_codes_count >= maxCodes) {
            await client.query("ROLLBACK");
            return res.json({ 
                success: true, 
                limitReached: true,
                pastCodes: pastCodes,
                message: 'Kampanya katılım limitinize ulaştınız. Görüntülenen kodlar daha önce almış olduğunuz kodlardır.' 
            });
        }

        const codeRes = await client.query(`SELECT * FROM Codes WHERE is_used = 0 LIMIT 1 FOR UPDATE SKIP LOCKED`);
        const codeRow = codeRes.rows[0];
        if (!codeRow) {
            await client.query("ROLLBACK");
            return res.status(404).json({ error: 'Dağıtılacak kampanya kodu kalmadı!' });
        }

        await client.query(`UPDATE Codes SET is_used = 1, assigned_to_tc = $1 WHERE id = $2`, [tc_no, codeRow.id]);
        await client.query(`UPDATE Users SET claimed_codes_count = claimed_codes_count + 1 WHERE tc_no = $1`, [tc_no]);

        await client.query("COMMIT");
        res.json({ 
            success: true, 
            limitReached: false,
            code: codeRow.code,
            pastCodes: pastCodes,
            message: 'Üye doğrulama başarılı! Kampanya kodunuz teslim edildi.'
        });

    } catch (err: any) {
        await client.query("ROLLBACK");
        res.status(500).json({ error: 'Sistem hatası.' });
    } finally {
        client.release();
    }
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


// Sadece üretim (Vercel gibi Serverless) ortamında değilsek doğrudan dinle
if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => {
        console.log(`API Sunucusu http://localhost:${PORT} adresinde çalışıyor. (DEV)`);
    });
}

// Vercel Serverless Function için app dışa aktarılıyor
export default app;
