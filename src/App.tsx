
import { BrowserRouter as Router, Routes, Route, NavLink } from 'react-router-dom';
import ClaimPage from './pages/ClaimPage';
import AdminDashboard from './pages/AdminDashboard';

function App() {
  return (
    <Router>
      <nav className="navbar">
        <NavLink to="/" className="brand" style={{ gap: '1rem', alignItems: 'center' }}>
          <img src="/talpa-logo.webp" alt="TALPA" style={{ height: '32px' }} />
          <img src="/brooks-brothers-logo.png" alt="Brooks Brothers" style={{ height: '24px' }} />
          <span>TALPA & Brooks Brothers</span>
        </NavLink>
        <div className="nav-links">
          <NavLink to="/" className={({isActive}) => isActive ? "active" : ""}>Kod Al</NavLink>
          <NavLink to="/admin" className={({isActive}) => isActive ? "active" : ""}>
             Yönetim Paneli
          </NavLink>
        </div>
      </nav>
      
      <main>
        <Routes>
          <Route path="/" element={<ClaimPage />} />
          <Route path="/admin" element={<AdminDashboard />} />
        </Routes>
      </main>
    </Router>
  );
}

export default App;
