const sqlite3 = require('sqlite3');
const path = require('path');

function generateValidTC() {
    let digits = [];
    digits[0] = Math.floor(Math.random() * 9) + 1;
    for (let i = 1; i < 9; i++) digits[i] = Math.floor(Math.random() * 10);
    const oddSum = digits[0] + digits[2] + digits[4] + digits[6] + digits[8];
    const evenSum = digits[1] + digits[3] + digits[5] + digits[7];
    digits[9] = ((oddSum * 7 - evenSum) % 10 + 10) % 10;
    const totalSum = digits.slice(0, 10).reduce((a, b) => a + b, 0);
    digits[10] = totalSum % 10;
    return digits.join('');
}

function generateCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = 'TALPA-';
    for(let i=0; i<8; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

const db = new sqlite3.Database(path.resolve(__dirname, 'database.sqlite'));

const tcs = [generateValidTC(), generateValidTC(), generateValidTC()];
const debtorTC = tcs[2]; // Make the 3rd one the debtor
const codes = Array.from({ length: 10 }, () => generateCode());

db.serialize(() => {
    // 1. Standart uyeleri (ve 1 tane borclu) ekle
    const stmtUsers = db.prepare(`INSERT OR IGNORE INTO Users (tc_no, claimed_codes_count, is_debtor) VALUES (?, 0, 0)`);
    tcs.forEach(tc => stmtUsers.run(tc));
    stmtUsers.finalize();

    // 2. Debtor guncelle
    db.run(`UPDATE Users SET is_debtor = 1 WHERE tc_no = ?`, [debtorTC]);

    // 3. Kodlari ekle
    const stmtCodes = db.prepare(`INSERT OR IGNORE INTO Codes (code, is_used) VALUES (?, 0)`);
    codes.forEach(c => stmtCodes.run(c));
    stmtCodes.finalize();
});

db.close(() => {
    console.log(JSON.stringify({
        normal1: tcs[0],
        normal2: tcs[1],
        debtor: debtorTC,
        codes: codes
    }, null, 2));
    console.log("Seeding complete.");
});
