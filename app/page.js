'use client';

import { useState } from 'react';
import ClipCard from '@/components/ClipCard';

// ─── Format seconds → MM:SS ───────────────────────────────────────────────
function formatTime(secs) {
  const m = Math.floor(secs / 60).toString().padStart(2, '0');
  const s = Math.floor(secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

// ─── Models Config ────────────────────────────────────────────────────────
const MODELS = [
  {
    id: 'gemini-3.8-flash',
    label: 'Gemini 3.8 Flash',
    icon: '⚡',
    description: 'Fastest model, great for standard videos.',
    thinkingBudget: 0,
  },
  {
    id: 'gemini-3.1-pro-preview',
    label: 'Gemini 3.1 Pro Extended Thinking',
    icon: '🧠',
    description: 'Uses extended thinking for deeper, more nuanced viral analysis.',
    thinkingBudget: 8000,
  },
  {
    id: 'gemini-3.5-flash',
    label: 'Gemini 3.5 Flash',
    icon: '💎',
    description: 'Highly capable model for complex reasoning tasks.',
    thinkingBudget: 0,
  },
  {
    id: 'gemini-2.5-flash',
    label: 'Gemini 2.5 Flash',
    icon: '🚀',
    description: 'Legacy price-performance model for low-latency tasks.',
    thinkingBudget: 0,
  },
];

// ─── Main Page ────────────────────────────────────────────────────────────
export default function Home() {
  const [url, setUrl] = useState('');
  const [phase, setPhase] = useState('idle'); // idle | analyzing | results | error
  const [statusMsg, setStatusMsg] = useState('');
  const [error, setError] = useState('');
  const [videoInfo, setVideoInfo] = useState(null);
  const [clips, setClips] = useState([]);
  const [jobId, setJobId] = useState(null);
  const [exportingAll, setExportingAll] = useState(false);
  const [selectedModel, setSelectedModel] = useState('gemini-3.8-flash');

  const handleAnalyze = async (e) => {
    e.preventDefault();
    const targetUrl = url.trim();
    if (!targetUrl) return;

    // Check localStorage cache first
    const cacheKey = `viral_clipper_${selectedModel}_${targetUrl}`;
    const cachedData = localStorage.getItem(cacheKey);
    if (cachedData) {
      try {
        const parsed = JSON.parse(cachedData);
        setVideoInfo(parsed.videoInfo);
        setClips(parsed.clips);
        setJobId(parsed.jobId);
        setPhase('results');
        return;
      } catch (err) {
        console.warn('Failed to parse cached data, fetching fresh...', err);
      }
    }

    setPhase('analyzing');
    setError('');
    setClips([]);
    setVideoInfo(null);
    setJobId(null);
    setStatusMsg('Fetching video info & captions…');

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim(), model: selectedModel, thinkingBudget: MODELS.find(m => m.id === selectedModel)?.thinkingBudget ?? 0 }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Analysis failed.');
        setPhase('error');
        return;
      }

      setVideoInfo(data.videoInfo);
      setClips(data.clips);
      setJobId(data.jobId);
      setPhase('results');

      // Save successful result to cache
      try {
        localStorage.setItem(cacheKey, JSON.stringify({
          videoInfo: data.videoInfo,
          clips: data.clips,
          jobId: data.jobId,
        }));
      } catch (err) {
        console.warn('Could not save to localStorage (might be full)', err);
      }
    } catch (err) {
      setError('Network error: ' + err.message);
      setPhase('error');
    }
  };

  const handleReset = () => {
    setPhase('idle');
    setUrl('');
    setError('');
    setClips([]);
    setVideoInfo(null);
    setJobId(null);
  };

  return (
    <div className="app-wrapper">
      <div className="bg-mesh" />

      {/* Header */}
      <header className="header">
        <div className="container">
          <div className="header-inner">
            <a className="logo" href="/">
              <div className="logo-icon">🎬</div>
              ViralClipper
              <span className="logo-badge">AI</span>
            </a>
            <div className="header-tags">
              <span className="tag">🧠 Gemini AI</span>
              <span className="tag">✂ ffmpeg</span>
              <span className="tag">📱 9:16 Shorts</span>
              <span className="tag">🎯 5-Step Framework</span>
            </div>
          </div>
        </div>
      </header>

      <main>
        <div className="container">
          {/* Hero */}
          {phase === 'idle' && (
            <section className="hero">
              <div className="hero-eyebrow">
                <span className="hero-eyebrow-dot" />
                Powered by the Illusion of Novelty Framework
              </div>
              <h1>
                Find your next<br />
                <span className="gradient-text">viral short-form clip</span>
              </h1>
              <p className="hero-subtitle">
                Paste any YouTube URL. Our AI analyzes the transcript using a 5-step editorial framework,
                scores each moment, and exports vertical 9:16 clips with subtitles — ready for TikTok, Reels, and Shorts.
              </p>
            </section>
          )}

          {phase === 'results' && (
            <div style={{ paddingTop: 32 }} />
          )}

          {/* URL Input */}
          {(phase === 'idle' || phase === 'error') && (
            <>
              <form onSubmit={handleAnalyze} style={{ marginBottom: 16 }}>
                <div className="input-card">
                  <label className="input-label" htmlFor="youtube-url">
                    YouTube Video URL
                  </label>
                  <div className="input-row">
                    <input
                      id="youtube-url"
                      type="url"
                      className="url-input"
                      placeholder="https://www.youtube.com/watch?v=..."
                      value={url}
                      onChange={e => setUrl(e.target.value)}
                      required
                      autoFocus
                    />
                    <button
                      id="analyze-btn"
                      type="submit"
                      className="btn-primary"
                      disabled={!url.trim()}
                    >
                      🔍 Analyze
                    </button>
                  </div>
                  {/* Model Selector */}
                  <div className="model-selector-row">
                    <span className="input-label" style={{ margin: 0 }}>Gemini Model</span>
                    <div className="model-options">
                      {MODELS.map(m => (
                        <button
                          key={m.id}
                          type="button"
                          className={`model-option ${selectedModel === m.id ? 'selected' : ''}`}
                          onClick={() => setSelectedModel(m.id)}
                          id={`model-${m.id}`}
                          title={m.description}
                        >
                          <span className="model-option-icon">{m.icon}</span>
                          <span className="model-option-name">{m.label}</span>
                          {m.thinkingBudget > 0 && (
                            <span className="model-option-badge">thinking</span>
                          )}
                        </button>
                      ))}
                    </div>
                    <div className="model-hint">
                      {MODELS.find(m => m.id === selectedModel)?.description}
                    </div>
                  </div>
                </div>
              </form>

              <div className="features-row">
                <div className="feature-chip"><span>🧠</span><span>AI Transcript Analysis</span></div>
                <div className="feature-chip"><span>🎯</span><span>5-Step Framework</span></div>
                <div className="feature-chip"><span>📊</span><span>Engagement Score /100</span></div>
                <div className="feature-chip"><span>✂</span><span>Auto Clip Trim</span></div>
                <div className="feature-chip"><span>📱</span><span>9:16 Vertical Export</span></div>
                <div className="feature-chip"><span>💬</span><span>Subtitle Overlay</span></div>
              </div>
            </>
          )}

          {/* Error */}
          {phase === 'error' && error && (
            <div className="error-card" role="alert">
              <span className="error-icon">⚠️</span>
              <div>
                <div className="error-message">{error}</div>
              </div>
            </div>
          )}

          {/* Analyzing State */}
          {phase === 'analyzing' && (
            <div style={{ paddingTop: 48 }}>
              <div className="status-bar">
                <div className="status-spinner" />
                <div className="status-text">{statusMsg}</div>
                <div className="status-step">AI Analysis</div>
              </div>

              <div style={{ textAlign: 'center', paddingTop: 40 }}>
                <div style={{ fontSize: '4rem', marginBottom: 16 }}>🤖</div>
                <div style={{ fontSize: '1rem', color: 'var(--text-secondary)', maxWidth: 440, margin: '0 auto', lineHeight: 1.7 }}>
                  Fetching captions, chunking transcript, and running the 5-Step Illusion of Novelty framework through Gemini AI. This usually takes 30–60 seconds.
                </div>
              </div>
            </div>
          )}

          {/* Results */}
          {phase === 'results' && (
            <>
              {/* Video Info */}
              {videoInfo && (
                <div className="video-info-card">
                  {videoInfo.thumbnail && (
                    <img
                      className="video-thumbnail"
                      src={videoInfo.thumbnail}
                      alt={videoInfo.title}
                    />
                  )}
                  <div className="video-meta">
                    <div className="video-title">{videoInfo.title}</div>
                    <div className="video-sub">
                      {videoInfo.uploader}
                      {videoInfo.viewCount
                        ? ` · ${(videoInfo.viewCount / 1000).toFixed(0)}K views`
                        : ''}
                    </div>
                  </div>
                  {videoInfo.duration && (
                    <div className="video-duration">
                      {formatTime(videoInfo.duration)}
                    </div>
                  )}
                </div>
              )}

              {/* Export All Bar */}
              <div className="export-all-bar">
                <div className="export-all-text">
                  <h3>Ready to Export</h3>
                  <p>
                    {clips.length} viral clip{clips.length !== 1 ? 's' : ''} identified.
                    Export individual clips below, or export all at once.
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <button
                    className="btn-secondary"
                    onClick={handleReset}
                    id="analyze-new-btn"
                  >
                    🔄 Analyze New Video
                  </button>
                </div>
              </div>

              {/* Clips */}
              <div className="section-header">
                <h2 className="section-title">
                  Viral Clip Candidates
                  <span className="count-badge">{clips.length}</span>
                </h2>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Sorted by Engagement Score
                </div>
              </div>

              <div className="clips-grid">
                {clips.map((clip, i) => (
                  <ClipCard
                    key={clip.clipNumber}
                    clip={clip}
                    rank={i}
                    jobId={jobId}
                    exportingAll={exportingAll}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </main>

      <footer className="footer">
        <div className="container">
          ViralClipper · Built with Gemini AI · 5-Step Illusion of Novelty Framework · Exports 9:16 for Shorts, Reels & TikTok
        </div>
      </footer>
    </div>
  );
}
