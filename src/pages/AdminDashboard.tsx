import { useState, useEffect } from 'react';
import { Users, Hash, Trash2, ShieldCheck, RefreshCw, AlertCircle, FileSpreadsheet } from 'lucide-react';
import * as XLSX from 'xlsx';

export default function AdminDashboard() {
  const [stats, setStats] = useState({ usersCount: 0, totalCodes: 0, usedCodes: 0, remainingCodes: 0 });
  const [limit, setLimit] = useState(1);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{type: 'success'|'error', text: string} | null>(null);

  const [tcFile, setTcFile] = useState<File | null>(null);
  const [debtorFile, setDebtorFile] = useState<File | null>(null);
  const [codeFile, setCodeFile] = useState<File | null>(null);

  const [singleTc, setSingleTc] = useState('');
  const [searchTc, setSearchTc] = useState('');
  const [searchedUser, setSearchedUser] = useState<any>(null);

  const [userList, setUserList] = useState<any[]>([]);
  const [codeList, setCodeList] = useState<any[]>([]);

  const fetchStats = async () => {
    try {
      const [statsRes, limitRes, usersRes, codesRes] = await Promise.all([
        fetch('/api/admin/stats'),
        fetch('/api/admin/settings'),
        fetch('/api/admin/users'),
        fetch('/api/admin/codes')
      ]);
      const s = await statsRes.json();
      const l = await limitRes.json();
      const u = await usersRes.json();
      const c = await codesRes.json();
      
      setStats(s);
      setLimit(l.maxCodesPerUser || 1);
      setUserList(u || []);
      setCodeList(c || []);
    } catch (err) {
      console.error('Stats could not be fetched', err);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const showMessage = (type: 'success'|'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  };

  const readFirstColumn = (file: File): Promise<string[]> => {
     return new Promise((resolve, reject) => {
         const reader = new FileReader();
         reader.onload = (e) => {
             try {
                 const data = e.target?.result;
                 const workbook = XLSX.read(data, { type: 'binary' });
                 const firstSheetName = workbook.SheetNames[0];
                 const worksheet = workbook.Sheets[firstSheetName];
                 const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
                 
                 const columnData = json.map((row: any) => row[0])
                     .filter((val) => val !== undefined && val !== null && val !== "")
                     .map(String)
                     .map((val) => val.trim());
                 resolve(columnData);
             } catch (err) {
                 reject(err);
             }
         };
         reader.onerror = (err) => reject(err);
         reader.readAsBinaryString(file);
     });
  };

  const handleUpdateLimit = async () => {
     try {
       setLoading(true);
       await fetch('/api/admin/settings', {
         method: 'PUT',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ maxCodesPerUser: limit })
       });
       showMessage('success', 'Limit başarıyla güncellendi.');
     } catch (err) {
       showMessage('error', 'Limit güncellenemedi.');
     } finally {
       setLoading(false);
     }
  };

  const handleUploadUsers = async () => {
     if (!tcFile) return showMessage('error', 'Lütfen standart üyeler için bir excel dosyası seçin.');
     try {
       setLoading(true);
       const rawUsers = await readFirstColumn(tcFile);
       const users = rawUsers.filter(t => t.length === 11);
       if (users.length === 0) throw new Error('Dosyada 11 haneli geçerli bir TCKN bulunamadı.');

       const res = await fetch('/api/admin/users/bulk', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ users })
       });
       const data = await res.json();
       if (res.ok) {
          showMessage('success', `${data.count} standart üye (Excel'den) eklendi.`);
          setTcFile(null);
          // @ts-ignore
          document.getElementById('tcFileInput').value = '';
          fetchStats();
       } else throw new Error();
     } catch(e: any) {
       showMessage('error', e.message || 'Üyeler eklenirken hata oluştu.');
     } finally {
       setLoading(false);
     }
  };

  const handleUploadDebtors = async () => {
     if (!debtorFile) return showMessage('error', 'Lütfen borçlu üyeler için bir excel dosyası seçin.');
     try {
       setLoading(true);
       const rawUsers = await readFirstColumn(debtorFile);
       const users = rawUsers.filter(t => t.length === 11);
       if (users.length === 0) throw new Error('Dosyada 11 haneli geçerli bir Borçlu TCKN bulunamadı.');
       
       const res = await fetch('/api/admin/users/debtors/bulk', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ users })
       });
       const data = await res.json();
       if (res.ok) {
          showMessage('success', `${data.count} borçlu üye (Excel'den) kaydedildi.`);
          setDebtorFile(null);
          // @ts-ignore
          document.getElementById('debtorFileInput').value = '';
          fetchStats();
       } else throw new Error();
     } catch(e: any) {
       showMessage('error', e.message || 'Borçlu üyeler eklenirken hata oluştu.');
     } finally {
       setLoading(false);
     }
  };

  const handleUploadCodes = async () => {
     if (!codeFile) return showMessage('error', 'Lütfen kod havuzu için bir excel dosyası seçin.');
     try {
       setLoading(true);
       const rawCodes = await readFirstColumn(codeFile);
       const codes = rawCodes.filter(c => c.length > 0);
       if (codes.length === 0) throw new Error('Excel dosyasında geçerli kod bulunamadı.');
       
       const res = await fetch('/api/admin/codes/bulk', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ codes })
       });
       const data = await res.json();
       if (res.ok) {
          showMessage('success', `${data.count} kod Excel'den havuza aktarıldı.`);
          setCodeFile(null);
          // @ts-ignore
          document.getElementById('codeFileInput').value = '';
          fetchStats();
       } else throw new Error();
     } catch(e: any) {
       showMessage('error', e.message || 'Kodlar eklenirken hata oluştu.');
     } finally {
       setLoading(false);
     }
  };

  const handleReset = async () => {
     if(!window.confirm('Tüm veriler (kullanıcılar ve kodlar) silinecek. Emin misiniz?')) return;
     try {
        setLoading(true);
        await fetch('/api/admin/reset', { method: 'DELETE' });
        showMessage('success', 'Sistem sıfırlandı.');
        fetchStats();
     } catch {
        showMessage('error', 'Sıfırlama hatası.');
     } finally {
        setLoading(false);
     }
  };

  const handleUploadSingle = async (is_debtor: boolean) => {
     if (singleTc.length !== 11) return showMessage('error', 'Lütfen 11 haneli geçerli bir TC girin.');
     try {
        setLoading(true);
        const res = await fetch('/api/admin/users/single', {
           method: 'POST',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify({ tc_no: singleTc, is_debtor })
        });
        if (!res.ok) throw new Error();
        showMessage('success', `Üye başarıyla eklendi (${is_debtor ? 'Borçlu' : 'Standart'}).`);
        setSingleTc('');
        fetchStats();
     } catch {
        showMessage('error', 'Eklenirken hata oluştu.');
     } finally {
        setLoading(false);
     }
  };

  const handleSearchTc = async () => {
     if (searchTc.length !== 11) return showMessage('error', 'Aramak için 11 haneli TCKN girin.');
     try {
        setLoading(true);
        setSearchedUser(null);
        const res = await fetch('/api/admin/users/search', {
           method: 'POST',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify({ tc_no: searchTc })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        setSearchedUser(data);
     } catch (err: any) {
        showMessage('error', err.message || 'Üye aranırken hata.');
     } finally {
        setLoading(false);
     }
  };

  const handleUpdateStatus = async (is_debtor: boolean) => {
     if (!searchedUser) return;
     try {
        setLoading(true);
        const res = await fetch('/api/admin/users/status', {
           method: 'PUT',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify({ tc_no: searchedUser.tc_no, is_debtor })
        });
        if (!res.ok) throw new Error();
        showMessage('success', 'Üye durumu başarıyla güncellendi.');
        setSearchedUser({ ...searchedUser, is_debtor: is_debtor ? 1 : 0 });
        fetchStats();
     } catch {
        showMessage('error', 'Güncellenirken hata oluştu.');
     } finally {
        setLoading(false);
     }
  };

  return (
    <div className="container" style={{ maxWidth: '1400px' }}>
      <div className="admin-header">
        <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
          <ShieldCheck size={28} className="text-primary" /> Yönetim Paneli
        </h1>
        <button className="btn danger" onClick={handleReset} disabled={loading} style={{ width: 'auto' }}>
          <Trash2 size={16} /> Sistemi Sıfırla
        </button>
      </div>

      {message && (
        <div className={`alert ${message.type}`}>
           {message.text}
        </div>
      )}

      <div className="admin-grid">
         <div className="stat-box">
            <h3>Kayıtlı Toplam Kullanıcı</h3>
            <div className="value">{stats.usersCount}</div>
         </div>
         <div className="stat-box">
            <h3>Toplam Kod Havuzu</h3>
            <div className="value">{stats.totalCodes}</div>
         </div>
         <div className="stat-box">
            <h3>Dağıtılan Kod</h3>
            <div className="value" style={{ color: 'var(--danger)' }}>{stats.usedCodes}</div>
         </div>
         <div className="stat-box">
            <h3>Kalan Kod</h3>
            <div className="value" style={{ color: 'var(--accent)' }}>{stats.remainingCodes}</div>
         </div>
      </div>

      <div className="actions-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))' }}>
         {/* Limits */}
         <div className="action-card" style={{ gridColumn: '1 / -1' }}>
            <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>Sistem Limitleri</h2>
            <div className="input-group" style={{ flexDirection: 'row', alignItems: 'flex-end', gap: '1rem' }}>
               <div style={{ flex: 1 }}>
                  <label htmlFor="limit" style={{ marginBottom: '0.5rem', display: 'block' }}>Üye Başına Seçilebilir Kod Limiti</label>
                  <select 
                     id="limit" 
                     value={limit} 
                     onChange={(e) => setLimit(Number(e.target.value))} 
                     style={{ width: '100%', padding: '0.875rem', borderRadius: '0.5rem', border: '1px solid var(--border-color)', backgroundColor: 'rgba(15, 23, 42, 0.5)', color: 'white', fontFamily: 'inherit', fontSize: '1rem' }}
                  >
                     <option value={1}>1 Kod</option>
                     <option value={3}>3 Kod</option>
                     <option value={5}>5 Kod</option>
                     <option value={10}>10 Kod</option>
                  </select>
               </div>
               <button className="btn" style={{ width: 'auto', padding: '0.875rem 1.5rem' }} onClick={handleUpdateLimit} disabled={loading}>
                  <RefreshCw size={16} /> Güncelle
               </button>
            </div>
         </div>

         {/* Users Upload */}
         <div className="action-card">
            <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Users size={20} color="var(--primary)" /> Standart Üye Yükle (Excel)</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '1rem' }}>Sadece kod alabilecek (aidat borcu olmayan) üyelerin bulunduğu .xlsx, .xls dosyanızı seçin (Tek Sütun = TCKN).</p>
            <div className="input-group">
               <input 
                  id="tcFileInput"
                  type="file" 
                  accept=".xlsx, .xls, .csv" 
                  onChange={(e) => setTcFile(e.target.files?.[0] || null)}
               />
               {tcFile && <span style={{ fontSize: '0.875rem', color: 'var(--accent)' }}>Seçilen Dosya: {tcFile.name}</span>}
            </div>
            <button className="btn" onClick={handleUploadUsers} disabled={loading || !tcFile}>
               <FileSpreadsheet size={16} /> Standart Üyeleri Yükle
            </button>
         </div>

         {/* Debtor Users Upload */}
         <div className="action-card" style={{ borderColor: 'var(--danger)' }}>
            <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--danger)' }}><AlertCircle size={20} /> Borçlu Üye Yükle (Excel)</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '1rem' }}>Sisteme giriş yaptıklarında "Aidat borcunuz nedeniyle..." uyarısı alması gereken üyelerin bulunduğu excel dosyasını seçin.</p>
            <div className="input-group">
               <input 
                  id="debtorFileInput"
                  type="file" 
                  accept=".xlsx, .xls, .csv" 
                  onChange={(e) => setDebtorFile(e.target.files?.[0] || null)}
               />
               {debtorFile && <span style={{ fontSize: '0.875rem', color: 'var(--accent)' }}>Seçilen Dosya: {debtorFile.name}</span>}
            </div>
            <button className="btn danger" onClick={handleUploadDebtors} disabled={loading || !debtorFile}>
               <FileSpreadsheet size={16} /> Borçlu Üyeleri Yükle
            </button>
         </div>

         {/* Codes Upload */}
         <div className="action-card">
            <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Hash size={20} color="var(--accent)" /> Kod Havuzu Yükle (Excel)</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '1rem' }}>Sisteme aktarılacak kampanya kodlarının bulunduğu excel dosyanızı seçin (Tek Sütun = Kodlar).</p>
            <div className="input-group">
               <input 
                  id="codeFileInput"
                  type="file" 
                  accept=".xlsx, .xls, .csv" 
                  onChange={(e) => setCodeFile(e.target.files?.[0] || null)}
               />
               {codeFile && <span style={{ fontSize: '0.875rem', color: 'var(--accent)' }}>Seçilen Dosya: {codeFile.name}</span>}
            </div>
            <button className="btn" style={{ backgroundColor: 'var(--accent)' }} onClick={handleUploadCodes} disabled={loading || !codeFile}>
               <FileSpreadsheet size={16} /> Kodları Havuza Yükle
            </button>
         </div>

         {/* Single Member Add */}
         <div className="action-card">
            <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Users size={20} color="var(--primary)" /> Tekil Üye Ekle</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '1rem' }}>Excel dosyası olmadan, elinizdeki tek bir TC kimlik numarasını doğrudan sisteme standart üye olarak (borçsuz) ekleyebilirsiniz.</p>
            <div className="input-group">
               <input 
                  type="text" 
                  placeholder="11 Haneli TC Kimlik No" 
                  maxLength={11}
                  value={singleTc}
                  onChange={(e) => setSingleTc(e.target.value.replace(/\D/g, ''))}
                  style={{ backgroundColor: 'rgba(15, 23, 42, 0.8)', borderColor: 'rgba(255,255,255,0.1)' }}
               />
            </div>
            <button className="btn" onClick={() => handleUploadSingle(false)} disabled={loading || singleTc.length !== 11}>
               <Users size={16} /> Standart Üye Olarak Ekle
            </button>
         </div>

         {/* Status Search and Edit */}
         <div className="action-card" style={{ gridColumn: '1 / -1', borderColor: 'var(--accent)' }}>
            <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'white' }}><RefreshCw size={20} color="var(--accent)"/> Üye Durumu Yönetimi (Statü Düzenleme)</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '1rem' }}>Bir üyenin statüsünü aratıp mevcut durumu görebilir, değiştirebilirsiniz.</p>
            <div className="input-group" style={{ flexDirection: 'row', alignItems: 'flex-start', gap: '1rem' }}>
               <div style={{ flex: 1 }}>
                  <input 
                     type="text" 
                     placeholder="Aramak için 11 Haneli TC Kimlik No Girin" 
                     maxLength={11}
                     value={searchTc}
                     onChange={(e) => setSearchTc(e.target.value.replace(/\D/g, ''))}
                     style={{ backgroundColor: 'rgba(15, 23, 42, 0.8)', borderColor: 'rgba(255,255,255,0.1)' }}
                  />
               </div>
               <button className="btn" onClick={handleSearchTc} disabled={loading || searchTc.length !== 11} style={{ width: 'auto', padding: '0.875rem 2rem' }}>
                  Ara
               </button>
            </div>
            {searchedUser && (
               <div style={{ marginTop: '1.5rem', padding: '1.5rem', backgroundColor: 'rgba(15, 23, 42, 0.6)', borderRadius: '0.5rem', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                     <div>
                        <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Bulunan TCKN</div>
                        <div style={{ fontSize: '1.25rem', fontFamily: 'monospace', color: 'white' }}>{searchedUser.tc_no}</div>
                        <div style={{ marginTop: '0.5rem', fontSize: '0.875rem' }}>
                           Mevcut Durum: {searchedUser.is_debtor ? <span style={{ color: 'var(--danger)', fontWeight: 'bold' }}>Borçlu</span> : <span style={{ color: 'var(--accent)', fontWeight: 'bold' }}>Standart Üye</span>}
                        </div>
                     </div>
                     <div>
                        {searchedUser.is_debtor ? (
                           <button className="btn" onClick={() => handleUpdateStatus(false)} disabled={loading} style={{ backgroundColor: 'var(--accent)' }}>
                              Borç Tarafını Temizle (Standart Yap)
                           </button>
                        ) : (
                           <button className="btn danger" onClick={() => handleUpdateStatus(true)} disabled={loading}>
                              Üyeyi Borçlu Konumuna Al
                           </button>
                        )}
                     </div>
                  </div>
               </div>
            )}
         </div>
      </div>

      {/* Database Preview Section */}
      <div className="preview-section" style={{ marginTop: '3rem', paddingBottom: '3rem' }}>
        <h2 style={{ marginBottom: '1.5rem', color: 'white', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>Veritabanı Kayıtları (Önizleme)</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '2rem' }}>
           
           {/* Tablo: Kayıtlı Üyeler */}
           <div className="action-card">
              <h3>Kayıtlı Üyeler (Sistemdeki İlk 20 Kayıt)</h3>
              <div style={{ height: '350px', overflowY: 'auto', backgroundColor: 'rgba(15, 23, 42, 0.5)', borderRadius: '8px', padding: '1rem', marginTop: '1rem' }}>
                <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                  <thead>
                    <tr>
                      <th style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem', paddingTop: '0.5rem' }}>TCKN</th>
                      <th style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem', paddingTop: '0.5rem' }}>Durum</th>
                      <th style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem', paddingTop: '0.5rem' }}>Alınan Kod</th>
                    </tr>
                  </thead>
                  <tbody>
                    {userList.map((u: any, i: number) => (
                       <tr key={i}>
                          <td style={{ padding: '0.75rem 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>{u.tc_no}</td>
                          <td style={{ padding: '0.75rem 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                             {u.is_debtor ? <span style={{ color: 'var(--danger)', fontWeight: 'bold' }}>Borçlu</span> : <span style={{ color: 'var(--accent)' }}>Standart</span>}
                          </td>
                          <td style={{ padding: '0.75rem 0', borderBottom: '1px solid rgba(255,255,255,0.05)', textAlign: 'center' }}>{u.claimed_codes_count}</td>
                       </tr>
                    ))}
                    {userList.length === 0 && <tr><td colSpan={3} style={{ padding: '1.5rem 0', textAlign: 'center', color: 'var(--text-muted)' }}>Kayıtlı üye bulunmamaktadır.</td></tr>}
                  </tbody>
                </table>
              </div>
           </div>

           {/* Tablo: Kayıtlı Kodlar */}
           <div className="action-card">
              <h3>Kayıtlı Kodlar (Sistemdeki Son 20 Kayıt)</h3>
              <div style={{ height: '350px', overflowY: 'auto', backgroundColor: 'rgba(15, 23, 42, 0.5)', borderRadius: '8px', padding: '1rem', marginTop: '1rem' }}>
                <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                  <thead>
                    <tr>
                      <th style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem', paddingTop: '0.5rem' }}>Kod</th>
                      <th style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem', paddingTop: '0.5rem' }}>Durum</th>
                      <th style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem', paddingTop: '0.5rem' }}>Kullanan TCKN</th>
                    </tr>
                  </thead>
                  <tbody>
                    {codeList.map((c: any, i: number) => (
                       <tr key={i}>
                          <td style={{ padding: '0.75rem 0', borderBottom: '1px solid rgba(255,255,255,0.05)', fontFamily: 'monospace' }}>{c.code}</td>
                          <td style={{ padding: '0.75rem 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                             {c.is_used ? <span style={{ color: 'var(--danger)' }}>Kullanıldı</span> : <span style={{ color: 'var(--accent)' }}>Müsait</span>}
                          </td>
                          <td style={{ padding: '0.75rem 0', borderBottom: '1px solid rgba(255,255,255,0.05)', color: 'var(--text-muted)' }}>{c.assigned_to_tc || '-'}</td>
                       </tr>
                    ))}
                    {codeList.length === 0 && <tr><td colSpan={3} style={{ padding: '1.5rem 0', textAlign: 'center', color: 'var(--text-muted)' }}>Havuza eklenmiş kod bulunmamaktadır.</td></tr>}
                  </tbody>
                </table>
              </div>
           </div>
        </div>
      </div>
    </div>
  );
}
