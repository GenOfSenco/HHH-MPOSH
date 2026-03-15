import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usersApi } from '../api';
import type { User } from '../types';

interface AdminPageProps {
  user: User;
  onLogout: () => void;
}

export default function AdminPage({ user, onLogout }: AdminPageProps) {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    first_name: '',
    last_name: '',
    role: 'user' as 'admin' | 'user',
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      await usersApi.create(formData);
      setMessage({ type: 'success', text: 'Operative credentials generated successfully.' });
      setFormData({
        username: '',
        password: '',
        first_name: '',
        last_name: '',
        role: 'user',
      });
    } catch (err: unknown) {
      let errorMsg = 'Failed to create operative';
      if (err && typeof err === 'object' && 'response' in err) {
        const axiosError = err as { response?: { data?: { detail?: unknown } } };
        const detail = axiosError.response?.data?.detail;
        if (typeof detail === 'string') {
          errorMsg = detail;
        } else if (Array.isArray(detail)) {
          errorMsg = detail.map((e: { msg?: string; loc?: string[] }) =>
            `${e.loc?.join('.') || 'field'}: ${e.msg || 'invalid'}`
          ).join('; ');
        } else if (detail && typeof detail === 'object') {
          errorMsg = JSON.stringify(detail);
        }
      }
      setMessage({ type: 'error', text: errorMsg });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen p-6 md:p-12 max-w-7xl mx-auto">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-12 gap-6 glass-panel p-6 rounded-2xl">
        <div>
          <h1 className="text-4xl font-bold text-gradient mb-2">Command Center</h1>
          <div className="flex items-center gap-3 text-sm text-gray-400">
            <span className="w-2 h-2 rounded-full bg-alien-green animate-pulse"></span>
            <span>Sys.Admin: {user.first_name} {user.last_name}</span>
          </div>
        </div>
        <div className="flex gap-4 w-full md:w-auto">
          <button
            onClick={() => navigate('/dashboard')}
            className="flex-1 md:flex-none btn-secondary flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
            </svg>
            Dashboard
          </button>
          <button
            onClick={onLogout}
            className="flex-1 md:flex-none btn-danger flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Disconnect
          </button>
        </div>
      </header>
      
      <div className="max-w-2xl mx-auto">
        <div className="glass-panel rounded-2xl p-8 md:p-10 relative overflow-hidden group">
          {/* Decorative glowing lines */}
          <div className="absolute top-0 left-1/4 right-1/4 h-px bg-gradient-to-r from-transparent via-alien-blue/50 to-transparent"></div>
          
          <h2 className="text-2xl font-display font-semibold mb-8 text-alien-blue flex items-center gap-3">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
            </svg>
            Register New Operative
          </h2>
          
          {message && (
            <div
              className={`px-4 py-3 rounded-lg mb-8 flex items-center gap-3 backdrop-blur-sm ${
                message.type === 'success'
                  ? 'bg-green-900/30 border border-green-500/50 text-green-300'
                  : 'bg-red-900/30 border border-red-500/50 text-red-300'
              }`}
            >
              {message.type === 'success' ? (
                <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              ) : (
                <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
              {message.text}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-gray-400 text-sm mb-2 font-medium tracking-wide">First Name</label>
                <input
                  type="text"
                  value={formData.first_name}
                  onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                  className="w-full glass-input"
                  required
                />
              </div>
              <div>
                <label className="block text-gray-400 text-sm mb-2 font-medium tracking-wide">Last Name</label>
                <input
                  type="text"
                  value={formData.last_name}
                  onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                  className="w-full glass-input"
                  required
                />
              </div>
            </div>
            
            <div>
              <label className="block text-gray-400 text-sm mb-2 font-medium tracking-wide">Operative ID (Username)</label>
              <input
                type="text"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                className="w-full glass-input"
                required
                minLength={3}
                maxLength={50}
                placeholder="Min 3 characters"
              />
            </div>
            
            <div>
              <label className="block text-gray-400 text-sm mb-2 font-medium tracking-wide">Access Code (Password)</label>
              <input
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="w-full glass-input"
                required
                minLength={4}
                maxLength={100}
                placeholder="Min 4 characters"
              />
            </div>
            
            <div>
              <label className="block text-gray-400 text-sm mb-2 font-medium tracking-wide">Clearance Level</label>
              <div className="relative">
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value as 'admin' | 'user' })}
                  className="w-full glass-input appearance-none bg-space-900/80"
                >
                  <option value="user">Standard (User)</option>
                  <option value="admin">Command (Admin)</option>
                </select>
                <div className="absolute inset-y-0 right-0 flex items-center px-4 pointer-events-none text-gray-400">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
            </div>
            
            <div className="pt-4">
              <button
                type="submit"
                disabled={loading}
                className="btn-primary flex justify-center items-center gap-2"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    Processing...
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                    AUTHORIZE & CREATE
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
