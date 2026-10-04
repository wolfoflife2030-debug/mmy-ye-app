// Windows Hello (بصمة الإصبع / الوجه / PIN) عبر UserConsentVerifier من Windows Runtime
const { spawn } = require('child_process');

const PS_HEADER = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
[void][Windows.Security.Credentials.UI.UserConsentVerifier, Windows.Security.Credentials.UI, ContentType = WindowsRuntime]
[void][Windows.Security.Credentials.UI.UserConsentVerificationResult, Windows.Security.Credentials.UI, ContentType = WindowsRuntime]
[void][Windows.Security.Credentials.UI.UserConsentVerifierAvailability, Windows.Security.Credentials.UI, ContentType = WindowsRuntime]
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1' })[0]
function Await($op, $type) { $t = $asTask.MakeGenericMethod($type).Invoke($null, @($op)); [void]$t.Wait(-1); $t.Result }
`;

function run(body, timeoutMs) {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') return resolve({ ok: false, out: 'not_windows' });
    const script = PS_HEADER + body;
    const enc = Buffer.from(script, 'utf16le').toString('base64');
    const ps = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', enc],
      { windowsHide: true });
    let out = '', err = '';
    const timer = setTimeout(() => { try { ps.kill(); } catch (_) {} resolve({ ok: false, out: 'timeout' }); }, timeoutMs);
    ps.stdout.on('data', d => out += d);
    ps.stderr.on('data', d => err += d);
    ps.on('error', () => { clearTimeout(timer); resolve({ ok: false, out: 'spawn_failed' }); });
    ps.on('close', () => { clearTimeout(timer); resolve({ ok: !err.trim() || !!out.trim(), out: (out || err).trim() }); });
  });
}

async function available() {
  const r = await run(`Write-Output (Await ([Windows.Security.Credentials.UI.UserConsentVerifier]::CheckAvailabilityAsync()) ([Windows.Security.Credentials.UI.UserConsentVerifierAvailability]))`, 15000);
  return r.out.split(/\r?\n/).pop() === 'Available';
}

async function verify(message) {
  const safe = String(message || 'MMY.YE').replace(/'/g, "''").slice(0, 120);
  const r = await run(`Write-Output (Await ([Windows.Security.Credentials.UI.UserConsentVerifier]::RequestVerificationAsync('${safe}')) ([Windows.Security.Credentials.UI.UserConsentVerificationResult]))`, 90000);
  const res = r.out.split(/\r?\n/).pop();
  return { ok: res === 'Verified', cancelled: res === 'Canceled', result: res };
}

module.exports = { available, verify };
