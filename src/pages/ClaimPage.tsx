import React, { useState } from 'react';
import { Gift, AlertCircle, CheckCircle, Loader2, Copy, History, Tag, Info } from 'lucide-react';

const isValidTC = (tc: string): boolean => {
    if (tc.length !== 11 || !/^\d+$/.test(tc)) return false;
    return true;
};

const TermsAndConditions = () => (
  <div style={{ marginTop: '2rem', padding: '1.5rem', backgroundColor: 'rgba(0, 0, 0, 0.2)', borderRadius: '0.75rem', border: '1px solid rgba(255,255,255,0.05)', fontSize: '0.85rem', color: '#94a3b8', lineHeight: '1.6' }}>
    <h4 style={{ color: '#cbd5e1', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1rem' }}>
      <Info size={18} /> Kampanya Koşulları
    </h4>
    <ul style={{ paddingLeft: '1.25rem', margin: 0, display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
      <li>Kampanya, <strong>TALPA</strong> üyelerine özel olup, Brooks Brothers mağazalarından yapılacak alışverişlerde <strong>tüm indirimlere ek +%10 indirim</strong> ayrıcalığı sunulmaktadır.</li>
      <li>Kampanya sadece Brooks Brothers fiziki mağazalarında geçerlidir.</li>
      <li>Kampanyadan faydalanmak isteyen katılımcıların, eksiksiz aldıkları katılım kodunu Brooks Brothers mağazalarında kasa noktasında ödeme esnasında görevliye bildirmeleri gerekmektedir.</li>
      <li>Kampanya <strong>31.12.2026</strong> tarihine kadar geçerlidir ve indirim kodlarının geçerliliği aynı tarihte sona erecektir.</li>
      <li>Kazanılan indirim kodu <strong>tek kullanımlık</strong> olup, şifre kullanmadan yapılan alışverişlerde indirim sağlanmayacaktır.</li>
      <li>Kampanyadan her üye ayda <strong>1 defa</strong> faydalanabilir.</li>
      <li>Kampanya, diğer indirim kodu kampanyaları ile birleştirilemez.</li>
      <li>BB Perakende Mağazacılık Sanayi ve Ticaret A.Ş., kampanyayı dilediği zaman sonlandırma veya değiştirme hakkını saklı tutar.</li>
    </ul>
  </div>
);

export default function ClaimPage() {
  const [tcNo, setTcNo] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [codeData, setCodeData] = useState<{ code?: string, pastCodes: string[], limitReached: boolean, message: string } | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const handleClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidTC(tcNo)) {
      setError('Lütfen geçerli bir T.C. Kimlik Numarası giriniz.');
      return;
    }

    setLoading(true);
    setError(null);
    setCodeData(null);

    try {
      const response = await fetch('/api/claim-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tc_no: tcNo }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Beklenmeyen bir hata oluştu.');
      }

      setCodeData(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (txt: string) => {
    navigator.clipboard.writeText(txt);
    setCopiedCode(txt);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  return (
    <div className="flex-center" style={{ 
       backgroundImage: 'url(/brooks-brothers-bg.png)', 
       backgroundSize: 'cover', 
       backgroundPosition: 'top center', 
       backgroundAttachment: 'fixed',
       padding: '2rem 1rem', /* Ekran kuculdugunde kaydirmalar icon bosluk biraktim */
       minHeight: '100vh',
       alignItems: 'flex-start' /* Uzun metin yuzunden yukaridan baslatiyoruz */
    }}>
      <div className="card" style={{ maxWidth: '750px', width: '100%', backgroundColor: 'rgba(51, 65, 85, 0.7)', backdropFilter: 'blur(12px)', color: 'white', border: '1px solid rgba(255,255,255,0.2)', marginTop: '2rem', marginBottom: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '2rem', marginBottom: '1.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <img src="/talpa-logo.webp" alt="TALPA Logo" style={{ height: '70px', objectFit: 'contain' }} 
               onError={(e) => { e.currentTarget.style.display = 'none'; }} />
          <div style={{ width: '1px', height: '50px', backgroundColor: 'rgba(255,255,255,0.2)' }}></div>
          <img src="/brooks-brothers-logo.png" alt="Brooks Brothers Logo" style={{ height: '75px', objectFit: 'contain' }} 
               onError={(e) => { e.currentTarget.style.display = 'none'; }} />
        </div>

        <h1 className="title" style={{ fontSize: '1.8rem', marginBottom: '0.5rem', background: 'linear-gradient(135deg, #f8fafc, #cbd5e1)', WebkitBackgroundClip: 'text', color: 'transparent' }}>
          TALPA & Brooks Brothers İş Birliği
        </h1>
        <p style={{ textAlign: 'center', color: 'var(--text-muted)', marginBottom: '1.5rem', fontWeight: 500, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <span>TALPA Üyesi Kaptanlarımıza Özel Kampanya</span>
          <span style={{ color: 'var(--accent)', fontSize: '1.1rem', fontWeight: 700 }}><Tag size={18} style={{ display: 'inline', verticalAlign: 'text-bottom' }}/> Tüm Ürünlerde Geçerli %10 İndirim</span>
        </p>
        
        {error && (
          <div className="alert error" style={{ backgroundColor: 'rgba(239, 68, 68, 0.15)', borderColor: 'rgba(239, 68, 68, 0.3)' }}>
            <AlertCircle size={20} style={{ minWidth: '20px' }} />
            <span>{error}</span>
          </div>
        )}

        {codeData ? (
          <div>
             <div className={`alert ${codeData.limitReached ? 'warning' : 'success'}`} style={{ backgroundColor: codeData.limitReached ? 'rgba(245, 158, 11, 0.15)' : 'rgba(16, 185, 129, 0.15)', borderColor: codeData.limitReached ? 'rgba(245, 158, 11, 0.3)' : 'rgba(16, 185, 129, 0.3)', color: codeData.limitReached ? '#fcd34d' : '#6ee7b7' }}>
                {codeData.limitReached ? <History size={20} style={{ minWidth: '20px' }} /> : <CheckCircle size={20} style={{ minWidth: '20px' }} />}
                <span>{codeData.message}</span>
             </div>

             {/* Yeni Kod Gosterimi (Mevcutsa) */}
             {codeData.code && (
               <div className="code-display" style={{ background: 'rgba(30, 41, 59, 0.8)', border: '2px solid var(--accent)', marginBottom: '1.5rem', padding: '2rem 1.5rem' }}>
                  <div className="label" style={{ color: '#94a3b8' }}>YENİ %10 İNDİRİM KODUNUZ</div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem', marginTop: '1rem', flexWrap: 'wrap' }}>
                    <div className="code" style={{ margin: 0, textShadow: 'none', color: '#fff', fontSize: '1.75rem', wordBreak: 'break-all' }}>{codeData.code}</div>
                    <button onClick={() => copyToClipboard(codeData.code as string)} title="Kopyala" style={{ background: 'var(--accent)', color: '#000', border: 'none', borderRadius: '0.5rem', padding: '0.75rem', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                      {copiedCode === codeData.code ? <CheckCircle size={24} /> : <Copy size={24} />}
                    </button>
                  </div>
               </div>
             )}

             {/* Gecmis Kodlar (Mevcutsa) */}
             {codeData.pastCodes && codeData.pastCodes.length > 0 && (
               <div style={{ backgroundColor: 'rgba(30, 41, 59, 0.5)', borderRadius: '1rem', padding: '1.5rem', marginBottom: '2rem', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <h3 style={{ margin: '0 0 1rem 0', fontSize: '1rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <History size={18} /> Önceden Alınmış Kodlarınız
                  </h3>
                  <div style={{ display: 'grid', gap: '0.75rem' }}>
                    {codeData.pastCodes.map((pCode, idx) => (
                      <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(15, 23, 42, 0.6)', padding: '1rem', borderRadius: '0.5rem' }}>
                         <span style={{ fontFamily: 'monospace', fontSize: '1.25rem', fontWeight: 600, color: '#e2e8f0' }}>{pCode}</span>
                         <button onClick={() => copyToClipboard(pCode)} style={{ background: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--border-color)', borderRadius: '0.25rem', padding: '0.5rem', cursor: 'pointer' }}>
                           {copiedCode === pCode ? <CheckCircle size={18} color="var(--accent)" /> : <Copy size={18} />}
                         </button>
                      </div>
                    ))}
                  </div>
               </div>
             )}

             <button className="btn" onClick={() => { setCodeData(null); setTcNo(''); }} style={{ width: '100%' }}>
                Ana Ekrana Dön
             </button>
          </div>
        ) : (
          <form onSubmit={handleClaim}>
            <div className="input-group">
              <label htmlFor="tcNo" style={{ color: '#cbd5e1' }}>T.C. Kimlik Numarası</label>
              <input 
                id="tcNo"
                type="text" 
                maxLength={11}
                placeholder="11 haneli TCKN giriniz" 
                value={tcNo}
                onChange={(e) => {
                  const val = e.target.value.replace(/\\D/g, '');
                  if (val.length <= 11) {
                    setTcNo(val);
                  }
                }}
                disabled={loading}
                autoComplete="off"
                style={{ backgroundColor: 'rgba(15, 23, 42, 0.8)', borderColor: 'rgba(255,255,255,0.1)' }}
              />
            </div>
            
            <button type="submit" className="btn" disabled={loading || tcNo.length !== 11}>
              {loading ? (
                <><Loader2 className="animate-spin" size={20} style={{ animation: 'spin 1s linear infinite' }} /> Doğrulanıyor...</>
              ) : (
                <><Gift size={20} /> %10 İndirim Kodunu Al</>
              )}
            </button>
            <style>{`
               @keyframes spin { 100% { transform: rotate(360deg); } }
            `}</style>
          </form>
        )}

        {/* Kampanya Kosullari - Her iki durumda da gorunur. */}
        <TermsAndConditions />

      </div>
    </div>
  );
}
