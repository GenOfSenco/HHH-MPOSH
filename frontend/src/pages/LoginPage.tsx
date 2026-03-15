import { useState } from 'react';
import { authApi } from '../api';
import type { User } from '../types';

interface LoginPageProps {
  onLogin: (user: User, token: string) => void;
}

export default function LoginPage({ onLogin }: LoginPageProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const response = await authApi.login(username, password);
      onLogin(response.user, response.access_token);
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'response' in err) {
        const axiosError = err as { response?: { data?: { detail?: string } } };
        setError(axiosError.response?.data?.detail || 'Login failed');
      } else {
        setError('Login failed');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-grid-pattern">
      {/* Background glowing orbs */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-alien-green/10 rounded-full blur-[120px] pointer-events-none animate-pulse-slow"></div>
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-alien-blue/10 rounded-full blur-[120px] pointer-events-none animate-pulse-slow" style={{ animationDelay: '2s' }}></div>

      <div className="w-full max-w-md relative z-10 animate-float">
        <div className="text-center mb-10">
          <h1 className="text-5xl font-bold mb-2 tracking-wider text-gradient drop-shadow-lg">
            ALIEN SIGNAL
          </h1>
          <h2 className="text-2xl text-alien-blue/80 tracking-widest font-light">CLASSIFIER</h2>
          <div className="flex items-center justify-center gap-3 mt-4">
            <div className="h-px w-12 bg-gradient-to-r from-transparent to-alien-green/50"></div>
            <p className="text-gray-400 text-sm tracking-widest uppercase">Year 2226 | Earth Command</p>
            <div className="h-px w-12 bg-gradient-to-l from-transparent to-alien-green/50"></div>
          </div>
        </div>
        
        <form
          onSubmit={handleSubmit}
          className="glass-panel rounded-2xl p-8 relative overflow-hidden group"
        >
          {/* Subtle top border glow */}
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-alien-green/50 to-transparent opacity-50 group-hover:opacity-100 transition-opacity duration-500"></div>

          <h3 className="text-2xl font-display font-semibold mb-8 text-center text-white/90">Authentication Required</h3>
          
          {error && (
            <div className="bg-red-900/40 border border-red-500/50 text-red-200 px-4 py-3 rounded-lg mb-6 flex items-center gap-3 backdrop-blur-sm">
              <svg className="w-5 h-5 text-red-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm">{error}</span>
            </div>
          )}

          <div className="space-y-6">
            <div>
              <label className="block text-gray-400 text-sm mb-2 font-medium tracking-wide">OPERATIVE ID</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full glass-input"
                placeholder="Enter your identifier"
                required
              />
            </div>
            
            <div className="mb-8">
              <label className="block text-gray-400 text-sm mb-2 font-medium tracking-wide">ACCESS CODE</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full glass-input"
                placeholder="Enter access code"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-5 w-5 text-space-900" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  ESTABLISHING LINK...
                </>
              ) : (
                'INITIATE UPLINK'
              )}
            </button>
          </div>
          
          <p className="text-gray-500 text-xs text-center mt-6 tracking-wide font-mono">
            SYS.ADMIN OVERRIDE: admin / admin
          </p>
        </form>
      </div>
    </div>
  );
}
