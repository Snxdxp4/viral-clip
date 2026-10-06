/**
 * POST /api/analyze
 * 
 * Accepts a YouTube URL, fetches captions, and runs Gemini AI analysis
 * using the 5-Step "Illusion of Novelty" framework.
 * 
 * Body: { url: string, model?: string, thinkingBudget?: number }
 * Returns: { jobId, videoInfo, clips: [...] }
 */

import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getVideoInfo } from '@/lib/ytdlp';
import { fetchCaptions, chunkCaptions } from '@/lib/captions';
import { analyzeForViralClips } from '@/lib/gemini';

// Directory to store job data
const JOBS_DIR = path.join(process.cwd(), 'jobs');

export async function POST(request) {
  try {
    const body = await request.json();
    const { url, model = 'gemini-3.8-flash', thinkingBudget = 8000 } = body;

    if (!url || !url.includes('youtube.com') && !url.includes('youtu.be')) {
      return NextResponse.json(
        { error: 'Please provide a valid YouTube URL.' },
        { status: 400 }
      );
    }

    // Step 1: Fetch video metadata
    let videoInfo;
    try {
      videoInfo = await getVideoInfo(url);
    } catch (err) {
      return NextResponse.json({ error: err.message }, { status: 500 });
    }

    // Create job directory using the YouTube video ID
    const jobId = videoInfo.id;
    const jobDir = path.join(JOBS_DIR, jobId);
    fs.mkdirSync(jobDir, { recursive: true });

    // Step 2: Fetch captions
    let captionSegments;
    try {
      captionSegments = await fetchCaptions(url, jobDir);
    } catch (err) {
      return NextResponse.json(
        { error: `Caption fetch failed: ${err.message}` },
        { status: 500 }
      );
    }

    if (!captionSegments || captionSegments.length === 0) {
      return NextResponse.json(
        { error: 'No captions found for this video. Try a video with English captions.' },
        { status: 422 }
      );
    }

    // Step 3: Chunk captions into ~60s blocks for AI analysis
    const chunks = chunkCaptions(captionSegments, 60);

    // Step 4: Analyze with Gemini AI
    let clips;
    try {
      clips = await analyzeForViralClips(chunks, videoInfo.title, model, thinkingBudget);
    } catch (err) {
      return NextResponse.json({ error: err.message }, { status: 500 });
    }

    // Step 5: Save job state to disk for the export step
    const jobState = {
      jobId,
      url,
      model,
      thinkingBudget,
      videoInfo,
      captionSegments,
      clips,
      createdAt: new Date().toISOString(),
      status: 'analyzed',
    };
    fs.writeFileSync(path.join(jobDir, 'job.json'), JSON.stringify(jobState, null, 2));

    return NextResponse.json({ jobId, videoInfo, clips });
  } catch (err) {
    console.error('[/api/analyze] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error: ' + err.message }, { status: 500 });
  }
}
