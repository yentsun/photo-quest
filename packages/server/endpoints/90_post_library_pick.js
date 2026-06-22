import { spawn } from 'node:child_process';
import { json } from '../src/http.js';

const PS_SCRIPT = [
  '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
  'Add-Type -AssemblyName System.Windows.Forms',
  '$d = New-Object System.Windows.Forms.OpenFileDialog',
  "$d.Title = 'Select a Photo Quest library file'",
  "$d.Filter = 'Photo Quest Library (*.db)|*.db|All files (*.*)|*.*'",
  '$d.CheckFileExists = $true',
  'if ($d.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { $d.FileName } else { "" }',
].join('; ');

export default async (kojo, logger) => {
  kojo.ops.addHttpRoute({
    method: 'POST',
    pathname: '/library/pick',
  }, (req, res) => {
    const ps = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', PS_SCRIPT]);
    const chunks = [];
    ps.stdout.on('data', chunk => chunks.push(chunk));
    ps.on('close', () => {
      const selected = Buffer.concat(chunks).toString('utf8').trim();
      json(res, 200, selected ? { path: selected } : { cancelled: true });
    });
    ps.on('error', err => {
      logger.error('library pick dialog failed', err.message);
      json(res, 500, { error: 'Could not open file dialog' });
    });
  });
};
