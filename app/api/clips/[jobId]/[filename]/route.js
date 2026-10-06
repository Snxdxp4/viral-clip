/**
 * GET /api/clips/[jobId]/[filename]
 * Serves exported video clip files for download.
 */

import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const JOBS_DIR = path.join(process.cwd(), 'jobs');

export async function GET(request, { params }) {
  const { jobId, filename } = await params;

  // Basic security: prevent directory traversal
  if (
    !jobId || !filename ||
    jobId.includes('/') || jobId.includes('\\') || jobId === '..' ||
    filename.includes('/') || filename.includes('\\') || filename === '..'
  ) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
  }

  const filePath = path.join(JOBS_DIR, jobId, filename);

  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }

  const fileBuffer = fs.readFileSync(filePath);
  const safeFilename = filename.replace(/[^\x00-\x7F]/g, '_');
  
  return new Response(fileBuffer, {
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Disposition': `attachment; filename="${safeFilename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'Content-Length': fileBuffer.length.toString(),
    },
  });
}
