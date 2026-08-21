/**
 * @file POST /open-folder -- Open a native OS folder picker dialog on the server
 * and return the selected path. Satisfies LAW 1.2 (native file picker, no text input).
 *
 * Uses PowerShell's FolderBrowserDialog (Windows). The dialog opens on the server
 * machine, which is the same machine the user is working on in the local-app use case.
 */

import { spawn } from 'node:child_process';
import { json } from '../src/http.js';

const PS_SCRIPT = [
  '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
  'Add-Type -AssemblyName System.Windows.Forms',
  '$owner = New-Object System.Windows.Forms.Form',
  '$owner.TopMost = $true',
  '$owner.ShowInTaskbar = $false',
  '$owner.Opacity = 0',
  '$owner.StartPosition = "CenterScreen"',
  '$owner.Size = New-Object System.Drawing.Size(1,1)',
  '$owner.Show()',
  '$d = New-Object System.Windows.Forms.FolderBrowserDialog',
  "$d.Description = 'Select a media folder'",
  '$d.ShowNewFolderButton = $false',
  '$d.ShowDialog($owner) | Out-Null',
  '$owner.Dispose()',
  'if ($d.SelectedPath) { $d.SelectedPath } else { "" }',
].join('; ');

export default async (kojo, logger) => {
  kojo.ops.addHttpRoute({
    method: 'POST',
    pathname: '/open-folder',
  }, (req, res) => {
    const ps = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', PS_SCRIPT], { windowsHide: true });

    const chunks = [];
    ps.stdout.on('data', (chunk) => chunks.push(chunk));
    ps.on('close', () => {
      const selectedPath = Buffer.concat(chunks).toString('utf8').trim();
      json(res, 200, selectedPath ? { path: selectedPath } : { cancelled: true });
    });
    ps.on('error', (err) => {
      logger.error('open-folder dialog failed', err.message);
      json(res, 500, { error: 'Could not open folder dialog' });
    });
  });
};
