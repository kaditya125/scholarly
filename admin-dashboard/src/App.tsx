import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './lib/AuthContext';
import { ThemeProvider } from './lib/ThemeContext';
import { AdminRoutes } from './admin/routes/AdminRoutes';
import { AdminLogin } from './admin/pages/AdminLogin';

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <Router>
          <Routes>
            <Route path="/login" element={<AdminLogin />} />
            <Route path="/admin/*" element={<AdminRoutes />} />
            <Route path="*" element={<Navigate to="/admin/dashboard" replace />} />
          </Routes>
        </Router>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
