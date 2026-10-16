/**
 * Vercel Serverless Function: Status Endpoint (/api/status)
 */

import fs from 'fs';
import path from 'path';

export default function handler(req, res) {
  try {
    const statusFile = path.join(process.cwd(), 'sync_status.json');
    const status = fs.existsSync(statusFile)
      ? JSON.parse(fs.readFileSync(statusFile, 'utf-8'))
      : { status: 'idle' };

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, ...status }));
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: err.message }));
  }
}
