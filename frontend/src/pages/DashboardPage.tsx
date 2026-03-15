import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Brush, Cell,
} from 'recharts';
import { analyticsApi, predictionApi } from '../api';
import type { User, TrainingHistory, Stats, PredictionResponse } from '../types';

interface DashboardPageProps {
  user: User;
  onLogout: () => void;
}

const PredictionTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ payload: { sample_id: number; confidence: number; is_correct: boolean; predicted_class?: string; actual_class?: string } }> }) => {
  if (active && payload && payload.length) {
    const d = payload[0].payload;
    return (
      <div className="glass-panel p-4 rounded-xl text-sm border-l-4" style={{ borderLeftColor: d.is_correct ? '#00ff88' : '#ff4444' }}>
        <p className="text-gray-300 font-mono mb-1">Sample #{d.sample_id}</p>
        <p className="font-bold flex items-center gap-2 mb-2" style={{ color: d.is_correct ? '#00ff88' : '#ff4444' }}>
          {d.is_correct ? (
            <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg> Correct Match</>
          ) : (
            <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg> Mismatch</>
          )}
        </p>
        <div className="space-y-1">
          <p className="text-gray-300 flex justify-between gap-4">
            <span className="text-gray-500">Confidence:</span> 
            <span className="font-mono text-alien-blue">{(d.confidence * 100).toFixed(1)}%</span>
          </p>
          {d.predicted_class && (
            <p className="text-gray-300 flex justify-between gap-4">
              <span className="text-gray-500">Predicted:</span> 
              <span className="truncate max-w-[120px]" title={d.predicted_class}>{d.predicted_class}</span>
            </p>
          )}
          {d.actual_class && (
            <p className="text-gray-300 flex justify-between gap-4">
              <span className="text-gray-500">Actual:</span> 
              <span className="truncate max-w-[120px]" title={d.actual_class}>{d.actual_class}</span>
            </p>
          )}
        </div>
      </div>
    );
  }
  return null;
};

export default function DashboardPage({ user, onLogout }: DashboardPageProps) {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [trainingHistory, setTrainingHistory] = useState<TrainingHistory | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [predictions, setPredictions] = useState<PredictionResponse | null>(null);
  const [uploading, setUploading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      const maxRetries = 5;
      const delayMs = 2000;
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const [historyData, statsData] = await Promise.all([
            analyticsApi.getTrainingHistory(),
            analyticsApi.getStats(),
          ]);
          setTrainingHistory(historyData);
          setStats(statsData);
          setError(null);
          break;
        } catch (err: unknown) {
          const ax = err as { response?: { status: number }; request?: unknown };
          const noResponse = ax.request && !ax.response;
          const serverError = ax.response && ax.response.status >= 500;
          const shouldRetry = (noResponse || serverError) && attempt < maxRetries;
          if (shouldRetry) {
            await new Promise((r) => setTimeout(r, delayMs));
            continue;
          }
          setError(noResponse
            ? 'Не удалось загрузить аналитику. Backend не отвечает (порт 8000). Запустите run.py.'
            : 'Не удалось загрузить аналитику. Связь с ядром потеряна.');
        }
      }
      setLoadingData(false);
    };
    loadData();
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith('.npz')) {
      setError('Критическая ошибка: Требуется формат .npz');
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const result = await predictionApi.predict(file);
      setPredictions(result);
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'response' in err) {
        const e = err as { response?: { data?: { detail?: string } } };
        setError(e.response?.data?.detail || 'Ошибка классификации сигнала');
      } else {
        setError('Ошибка классификации сигнала');
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const epochData = trainingHistory
    ? trainingHistory.val_accuracy.map((acc, idx) => ({
        epoch: idx + 1,
        'Val Accuracy': parseFloat((acc).toFixed(4)),
        'Train Accuracy': parseFloat((trainingHistory.accuracy[idx]).toFixed(4)),
      }))
    : [];

  const trainDistData = stats
    ? Object.entries(stats.train_distribution)
        .sort((a, b) => b[1] - a[1])
        .map(([name, count]) => ({
          name: name.replace(/_/g, ' '),
          Количество: count,
        }))
    : [];

  const validTop5Data = stats?.valid_top5
    ? (Array.isArray(stats.valid_top5)
        ? stats.valid_top5.map((item: { class?: string; count?: number }) => ({
            name: (item.class ?? item.name ?? '').replace(/_/g, ' '),
            Количество: item.count ?? item.Количество ?? 0,
          }))
        : Object.entries(stats.valid_top5).map(([name, count]) => ({
            name: name.replace(/_/g, ' '),
            Количество: count,
          })))
    : [];

  const predBarData = predictions
    ? predictions.predictions.map((p) => ({
        sample_id: p.sample_id,
        confidence: parseFloat((p.confidence).toFixed(4)),
        is_correct: p.is_correct,
        predicted_class: p.predicted_class,
        actual_class: p.actual_class,
      }))
    : [];

  const correctCount = predBarData.filter((d) => d.is_correct).length;
  const wrongCount = predBarData.length - correctCount;

  return (
    <div className="min-h-screen p-4 md:p-8 lg:p-12 max-w-[1600px] mx-auto space-y-8">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 glass-panel p-6 rounded-2xl">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold text-gradient mb-2">
            Signal Analysis Dashboard
          </h1>
          <div className="flex items-center gap-3 text-sm text-gray-400">
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-alien-green opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-alien-green"></span>
            </span>
            <span className="tracking-wider uppercase">ОПЕРАТОР: {user.first_name} {user.last_name}</span>
          </div>
        </div>
        <div className="flex gap-4 w-full md:w-auto">
          {user.role === 'admin' && (
            <button
              onClick={() => navigate('/admin')}
              className="flex-1 md:flex-none px-6 py-2.5 bg-alien-purple/20 text-alien-purple border border-alien-purple/50 rounded-lg hover:bg-alien-purple hover:text-white transition-all duration-300 transform hover:-translate-y-0.5 shadow-[0_0_15px_rgba(153,102,255,0.2)] hover:shadow-[0_0_25px_rgba(153,102,255,0.4)] flex items-center justify-center gap-2 font-medium"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Admin Panel
            </button>
          )}
          <button
            onClick={onLogout}
            className="flex-1 md:flex-none btn-danger flex items-center justify-center gap-2 font-medium"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Выход
          </button>
        </div>
      </header>

      <section className="glass-panel rounded-2xl p-6 md:p-8 relative overflow-hidden group">
        <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-alien-green to-alien-blue opacity-50"></div>
        
        <h2 className="text-xl md:text-2xl font-display font-semibold mb-6 flex items-center gap-3">
          <svg className="w-6 h-6 text-alien-blue" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          Классификация сигналов (Inference)
        </h2>
        
        <div className="flex flex-col lg:flex-row items-center gap-8">
          <div className="w-full lg:w-1/3 min-w-[280px]">
            <label className="block w-full">
              <div className="relative group/upload cursor-pointer w-full">
                <div className="absolute -inset-1 bg-gradient-to-r from-alien-green to-alien-blue rounded-xl blur opacity-25 group-hover/upload:opacity-50 transition duration-500"></div>
                <div className="relative bg-space-900 border border-white/10 rounded-xl p-6 flex flex-col items-center justify-center gap-3 transition-colors hover:bg-space-800 h-32">
                  <svg className="w-8 h-8 text-alien-green" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  <span className="text-gray-300 font-medium">Загрузить массив данных</span>
                  <span className="text-xs text-gray-500 font-mono">.npz формат</span>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".npz"
                  onChange={handleFileUpload}
                  disabled={uploading}
                  className="hidden"
                />
              </div>
            </label>
          </div>
          
          <div className="flex-1 w-full flex items-center justify-center lg:justify-start">
            {uploading && (
              <div className="flex flex-col items-center gap-4 text-alien-green animate-pulse w-full max-w-sm p-6 glass-panel rounded-xl">
                <div className="relative w-16 h-16">
                  <div className="absolute inset-0 border-4 border-alien-green/20 rounded-full"></div>
                  <div className="absolute inset-0 border-4 border-alien-green border-t-transparent rounded-full animate-spin"></div>
                </div>
                <span className="font-mono tracking-widest text-sm">ДЕКОДИРОВАНИЕ СИГНАЛА...</span>
              </div>
            )}
            
            {predictions && !uploading && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 md:gap-6 w-full">
                <div className="glass-panel p-4 rounded-xl text-center relative overflow-hidden group/stat">
                  <div className="absolute inset-0 bg-gradient-to-b from-alien-green/10 to-transparent opacity-0 group-hover/stat:opacity-100 transition-opacity"></div>
                  <div className="text-3xl md:text-4xl font-bold text-alien-green mb-1 font-display">
                    {(predictions.accuracy * 100).toFixed(1)}%
                  </div>
                  <div className="text-xs text-gray-400 uppercase tracking-wider">Точность</div>
                </div>
                <div className="glass-panel p-4 rounded-xl text-center relative overflow-hidden group/stat">
                  <div className="absolute inset-0 bg-gradient-to-b from-alien-blue/10 to-transparent opacity-0 group-hover/stat:opacity-100 transition-opacity"></div>
                  <div className="text-3xl md:text-4xl font-bold text-alien-blue mb-1 font-display">
                    {predictions.loss.toFixed(3)}
                  </div>
                  <div className="text-xs text-gray-400 uppercase tracking-wider">Потери</div>
                </div>
                <div className="glass-panel p-4 rounded-xl text-center relative overflow-hidden group/stat border-b-2 border-b-green-500">
                  <div className="absolute inset-0 bg-gradient-to-b from-green-500/10 to-transparent opacity-0 group-hover/stat:opacity-100 transition-opacity"></div>
                  <div className="text-3xl md:text-4xl font-bold text-green-400 mb-1 font-display">{correctCount}</div>
                  <div className="text-xs text-gray-400 uppercase tracking-wider">Верно</div>
                </div>
                <div className="glass-panel p-4 rounded-xl text-center relative overflow-hidden group/stat border-b-2 border-b-red-500">
                  <div className="absolute inset-0 bg-gradient-to-b from-red-500/10 to-transparent opacity-0 group-hover/stat:opacity-100 transition-opacity"></div>
                  <div className="text-3xl md:text-4xl font-bold text-red-400 mb-1 font-display">{wrongCount}</div>
                  <div className="text-xs text-gray-400 uppercase tracking-wider">Неверно</div>
                </div>
              </div>
            )}
          </div>
        </div>

        {error && (
          <div className="mt-6 bg-red-900/30 border border-red-500/50 text-red-300 px-4 py-3 rounded-lg flex items-center gap-3 backdrop-blur-sm">
            <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            {error}
          </div>
        )}
      </section>

      {loadingData ? (
        <div className="flex flex-col items-center justify-center py-32 space-y-6">
          <div className="relative w-24 h-24">
            <div className="absolute inset-0 border-4 border-alien-blue/20 rounded-full"></div>
            <div className="absolute inset-0 border-4 border-alien-blue border-t-transparent rounded-full animate-spin" style={{ animationDuration: '1.5s' }}></div>
            <div className="absolute inset-4 border-4 border-alien-green/20 rounded-full"></div>
            <div className="absolute inset-4 border-4 border-alien-green border-b-transparent rounded-full animate-spin" style={{ animationDuration: '2s', animationDirection: 'reverse' }}></div>
          </div>
          <div className="text-alien-blue font-mono tracking-widest animate-pulse">
            СИНХРОНИЗАЦИЯ ТЕЛЕМЕТРИИ...
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
          {/* Chart 1 */}
          <div className="glass-panel rounded-2xl p-6 md:p-8 flex flex-col h-[480px]">
            <h3 className="text-lg font-display font-semibold mb-6 flex items-center gap-3 text-white">
              <div className="w-3 h-3 rounded-full bg-alien-green shadow-[0_0_10px_rgba(0,255,136,0.8)]"></div>
              Динамика обучения нейросети
            </h3>
            <div className="flex-1 w-full min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={epochData} margin={{ top: 5, right: 20, bottom: 25, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2a2a4a" vertical={false} />
                  <XAxis dataKey="epoch" stroke="#8892b0" tick={{ fill: '#8892b0', fontSize: 12 }} tickLine={false} axisLine={false} dy={10} />
                  <YAxis stroke="#8892b0" domain={[0, 1]} tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} tick={{ fill: '#8892b0', fontSize: 12 }} tickLine={false} axisLine={false} dx={-10} />
                  <Tooltip
                    contentStyle={{ backgroundColor: 'rgba(18, 18, 42, 0.9)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5)' }}
                    itemStyle={{ color: '#e2e8f0', fontWeight: 500 }}
                    formatter={(v: number, name: string) => [`${(v * 100).toFixed(1)}%`, name]}
                  />
                  <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{ fontSize: '14px', color: '#cbd5e1' }} />
                  <Line type="monotone" name="Validation" dataKey="Val Accuracy" stroke="#00ff88" strokeWidth={3} dot={false} activeDot={{ r: 6, fill: '#00ff88', stroke: '#12122a', strokeWidth: 2 }} />
                  <Line type="monotone" name="Training" dataKey="Train Accuracy" stroke="#00ccff" strokeWidth={3} dot={false} activeDot={{ r: 6, fill: '#00ccff', stroke: '#12122a', strokeWidth: 2 }} strokeDasharray="6 6" opacity={0.7} />
                  <Brush dataKey="epoch" height={30} stroke="#00ff88" fill="rgba(26, 26, 58, 0.5)" travellerWidth={10} tickFormatter={() => ''} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Chart 2 */}
          <div className="glass-panel rounded-2xl p-6 md:p-8 flex flex-col h-[480px]">
            <h3 className="text-lg font-display font-semibold mb-6 flex items-center gap-3 text-white">
              <div className="w-3 h-3 rounded-full bg-alien-blue shadow-[0_0_10px_rgba(0,204,255,0.8)]"></div>
              Распределение обучающей выборки
            </h3>
            <div className="flex-1 w-full min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trainDistData} margin={{ top: 5, right: 20, bottom: 25, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2a2a4a" vertical={false} />
                  <XAxis dataKey="name" stroke="#8892b0" tick={false} tickLine={false} axisLine={false} />
                  <YAxis stroke="#8892b0" tick={{ fill: '#8892b0', fontSize: 12 }} tickLine={false} axisLine={false} dx={-10} />
                  <Tooltip
                    contentStyle={{ backgroundColor: 'rgba(18, 18, 42, 0.9)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }}
                    cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                  />
                  <Bar dataKey="Количество" radius={[4, 4, 0, 0]} maxBarSize={60}>
                    {trainDistData.map((_, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={`hsl(${(index * 360) / Math.max(trainDistData.length, 1)}, 80%, 60%)`}
                      />
                    ))}
                  </Bar>
                  <Brush dataKey="name" height={30} stroke="#00ccff" fill="rgba(26, 26, 58, 0.5)" travellerWidth={10} tickFormatter={() => ''} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Chart 3 */}
          <div className="glass-panel rounded-2xl p-6 md:p-8 flex flex-col h-[480px]">
            <h3 className="text-lg font-display font-semibold mb-6 flex items-center gap-3 text-white">
              <div className="w-3 h-3 rounded-full bg-alien-purple shadow-[0_0_10px_rgba(153,102,255,0.8)]"></div>
              Топ-5 классов (Валидация)
            </h3>
            <div className="flex-1 w-full min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={validTop5Data} layout="vertical" margin={{ top: 5, right: 20, bottom: 5, left: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2a2a4a" horizontal={false} />
                  <XAxis type="number" stroke="#8892b0" tick={{ fill: '#8892b0', fontSize: 12 }} tickLine={false} axisLine={false} dy={10} />
                  <YAxis type="category" dataKey="name" stroke="#8892b0" width={140} tick={{ fill: '#e2e8f0', fontSize: 13 }} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: 'rgba(18, 18, 42, 0.9)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }}
                    cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                  />
                  <Bar dataKey="Количество" radius={[0, 6, 6, 0]} barSize={32}>
                    {validTop5Data.map((_, index) => (
                      <Cell key={`top5-${index}`} fill={['#b388ff', '#9966ff', '#7c3aed', '#6d28d9', '#5b21b6'][index] || '#9966ff'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Chart 4 */}
          <div className="glass-panel rounded-2xl p-6 md:p-8 flex flex-col h-[480px]">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-6 gap-4">
              <h3 className="text-lg font-display font-semibold flex items-center gap-3 text-white">
                <div className="w-3 h-3 rounded-full bg-gradient-to-r from-alien-green to-red-500 shadow-[0_0_10px_rgba(255,255,255,0.5)]"></div>
                Уверенность предсказаний
              </h3>
              <div className="flex gap-4 text-xs font-medium tracking-wider uppercase">
                <span className="flex items-center gap-2 bg-space-800/80 px-3 py-1.5 rounded-md border border-white/5">
                  <span className="w-2 h-2 rounded-full bg-alien-green"></span>
                  <span className="text-gray-300">Верно</span>
                </span>
                <span className="flex items-center gap-2 bg-space-800/80 px-3 py-1.5 rounded-md border border-white/5">
                  <span className="w-2 h-2 rounded-full bg-red-500"></span>
                  <span className="text-gray-300">Неверно</span>
                </span>
              </div>
            </div>
            
            <div className="flex-1 w-full min-h-0">
              {predBarData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={predBarData} margin={{ top: 5, right: 20, bottom: 25, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2a2a4a" vertical={false} />
                    <XAxis dataKey="sample_id" stroke="#8892b0" tick={{ fill: '#8892b0', fontSize: 12 }} tickLine={false} axisLine={false} dy={10} />
                    <YAxis stroke="#8892b0" domain={[0, 1]} tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} tick={{ fill: '#8892b0', fontSize: 12 }} tickLine={false} axisLine={false} dx={-10} />
                    <Tooltip content={<PredictionTooltip />} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
                    <Bar dataKey="confidence" radius={[4, 4, 0, 0]} maxBarSize={40}>
                      {predBarData.map((entry, index) => (
                        <Cell
                          key={`pred-${index}`}
                          fill={entry.is_correct ? '#00ff88' : '#ef4444'}
                          fillOpacity={0.9}
                        />
                      ))}
                    </Bar>
                    <Brush dataKey="sample_id" height={30} stroke="#8892b0" fill="rgba(26, 26, 58, 0.5)" travellerWidth={10} tickFormatter={() => ''} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-gray-500 gap-4 border-2 border-dashed border-space-600 rounded-xl bg-space-800/20">
                  <svg className="w-16 h-16 opacity-30 text-alien-blue" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  <span className="font-mono text-sm tracking-widest text-gray-400">ОЖИДАНИЕ ДАННЫХ ДЛЯ АНАЛИЗА...</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
