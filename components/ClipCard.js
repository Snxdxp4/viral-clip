'use client';

import { useState, useCallback } from 'react';

// ─── Score Color Helper ────────────────────────────────────────────────────
function getScoreClass(score) {
  if (score >= 75) return 'score-high';
  if (score >= 50) return 'score-mid';
  return 'score-low';
}

// ─── Score Breakdown Labels ────────────────────────────────────────────────
const SCORE_LABELS = {
  hookPotential: 'Hook Potential /20',
  curiosityNovelty: 'Curiosity & Novelty /20',
  narrativeStrength: 'Narrative Strength /15',
  clarityContext: 'Clarity & Context /15',
  emotionalIntellectual: 'Emotional / Intellectual /10',
  strongEndingPayoff: 'Strong Ending /10',
  editingPotential: 'Editing Potential /10',
};

// ─── Framework Step Labels ────────────────────────────────────────────────
const FRAMEWORK_LABELS = {
  step1_newReveal: 'Step 1 — New Reveal + Outcome',
  step2_contrast: 'Step 2 — Contrast Framing',
  step3_urgency: 'Step 3 — Urgency / Recency',
  step4_proof: 'Step 4 — Bullseye Proof',
  step5_hookStyle: 'Step 5 — Protect the Illusion',
};

// ─── ClipCard Component ───────────────────────────────────────────────────
export default function ClipCard({ clip, rank, jobId, exportingAll }) {
  const [frameworkOpen, setFrameworkOpen] = useState(false);
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [exportState, setExportState] = useState('idle'); // idle | exporting | done | error
  const [exportLogs, setExportLogs] = useState([]);
  const [downloadUrl, setDownloadUrl] = useState(null);
  const [clipSize, setClipSize] = useState(null);

  const duration = clip.endTime - clip.startTime;
  const scoreClass = getScoreClass(clip.scoreBreakdown.total);

  const handleExport = useCallback(async () => {
    setExportState('exporting');
    setExportLogs([{ text: 'Starting export...', type: 'active' }]);

    try {
      const response = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId, clipNumbers: [clip.clipNumber] }),
      });

      if (!response.ok) throw new Error('Export request failed');
      if (!response.body) throw new Error('No stream body');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const events = buffer.split('\n\n');
        buffer = events.pop() || '';

        for (const eventBlock of events) {
          const lines = eventBlock.split('\n');
          let eventType = 'message';
          let dataStr = '';
          for (const line of lines) {
            if (line.startsWith('event: ')) eventType = line.slice(7);
            if (line.startsWith('data: ')) dataStr = line.slice(6);
          }
          if (!dataStr) continue;

          try {
            const data = JSON.parse(dataStr);
            if (eventType === 'progress') {
              const type = data.status === 'done' ? 'done' : data.status === 'error' ? 'error' : 'active';
              if (data.status === 'downloading') {
                setExportLogs(prev => {
                  const last = prev[prev.length - 1];
                  if (last && (last.text.startsWith('Downloading') || last.text.startsWith('Merging') || last.text.startsWith('[download]'))) {
                    return [...prev.slice(0, -1), { text: data.message, type: 'active' }];
                  }
                  return [...prev.slice(-9), { text: data.message, type: 'active' }];
                });
              } else {
                setExportLogs(prev => [...prev.slice(-9), { text: data.message, type }]);
              }
            } else if (eventType === 'done') {
              const clip = data.exportedClips?.[0];
              if (clip) {
                setDownloadUrl(clip.downloadUrl);
                setClipSize(clip.sizeMB);
              }
              setExportState('done');
            } else if (eventType === 'error') {
              setExportLogs(prev => [...prev, { text: data.message, type: 'error' }]);
              setExportState('error');
            }
          } catch (_) {}
        }
      }
    } catch (err) {
      setExportLogs(prev => [...prev, { text: err.message, type: 'error' }]);
      setExportState('error');
    }
  }, [jobId, clip.clipNumber]);

  return (
    <div className="clip-card" style={{ animationDelay: `${rank * 0.08}s` }}>
      {/* Top Row */}
      <div className="clip-card-top">
        <div className="clip-rank">#{rank + 1}</div>
        <div className="clip-main">
          <div className="clip-title">{clip.suggestedTitle}</div>
          <div className="clip-hook">💡 {clip.suggestedHook}</div>
          <div className="clip-meta-row">
            <span className="clip-time-badge">
              ⏱ {clip.startTimeFormatted} → {clip.endTimeFormatted}
            </span>
            <span className="clip-duration-badge">
              {Math.round(duration)}s clip
            </span>
          </div>
        </div>
      </div>

      {/* Score */}
      <div className="score-section">
        <div className="score-total">
          <span className="score-label">Viral Engagement Score</span>
          <span className={`score-number ${scoreClass}`}>
            {clip.scoreBreakdown.total}<span style={{ fontSize: '1rem', opacity: 0.5 }}>/100</span>
          </span>
        </div>
        <div className="score-bar-bg">
          <div
            className="score-bar-fill"
            style={{ width: `${clip.scoreBreakdown.total}%` }}
          />
        </div>
        <div className="score-breakdown-grid">
          {Object.entries(clip.scoreBreakdown)
            .filter(([k]) => k !== 'total')
            .map(([key, val]) => (
              <div className="score-breakdown-item" key={key}>
                <span className="score-breakdown-name">{SCORE_LABELS[key] || key}</span>
                <span className="score-breakdown-val">{val}</span>
              </div>
            ))}
        </div>
        {clip.scoreExplanation && (
          <div className="transcript-preview" style={{ marginTop: 12 }}>
            📊 {clip.scoreExplanation}
          </div>
        )}
      </div>

      {/* Framework Accordion */}
      <div className="framework-section">
        <button
          className={`framework-toggle ${frameworkOpen ? 'open' : ''}`}
          onClick={() => setFrameworkOpen(v => !v)}
          id={`framework-toggle-${clip.clipNumber}`}
        >
          <span>5-Step Framework Analysis</span>
          <span className="chevron">▲</span>
        </button>
        {frameworkOpen && (
          <div className="framework-steps">
            {Object.entries(clip.framework).map(([key, val]) => (
              <div className="framework-step" key={key}>
                <div className="framework-step-label">{FRAMEWORK_LABELS[key] || key}</div>
                <div className="framework-step-text">{val || '—'}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Transcript Preview */}
      {clip.transcriptPreview && (
        <>
          <button
            className="framework-toggle"
            style={{ marginTop: 12 }}
            onClick={() => setTranscriptOpen(v => !v)}
            id={`transcript-toggle-${clip.clipNumber}`}
          >
            <span>Transcript Preview</span>
            <span className="chevron">▲</span>
          </button>
          {transcriptOpen && (
            <div className="transcript-preview">"{clip.transcriptPreview}"</div>
          )}
        </>
      )}

      {/* Actions */}
      <div className="clip-actions">
        {exportState === 'idle' && (
          <button
            className="btn-export"
            onClick={handleExport}
            disabled={exportingAll}
            id={`export-clip-${clip.clipNumber}`}
          >
            🎬 Export This Clip
          </button>
        )}

        {exportState === 'exporting' && (
          <button className="btn-export" disabled>
            <span className="status-spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
            Exporting...
          </button>
        )}

        {exportState === 'done' && downloadUrl && (
          <a
            className="btn-download"
            href={downloadUrl}
            download
            id={`download-clip-${clip.clipNumber}`}
          >
            ⬇ Download ({clipSize} MB)
          </a>
        )}

        {exportState === 'error' && (
          <button
            className="btn-export"
            onClick={handleExport}
            disabled={exportingAll}
          >
            🔄 Retry Export
          </button>
        )}
      </div>

      {/* Export Progress Log */}
      {exportLogs.length > 0 && (
        <div className="export-progress">
          <div className="export-log">
            {exportLogs.map((log, i) => (
              <div key={i} className={`log-${log.type}`}>
                {log.type === 'done' ? '✓ ' : log.type === 'error' ? '✗ ' : '› '}{log.text}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
