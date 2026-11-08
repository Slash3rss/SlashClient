# Logs in to Certum's SimplySign on a GitHub Windows runner, so the cloud code signing certificate shows up
# in the Windows certificate store and scripts/win-sign.cjs can sign the launcher with signtool.
#
# SimplySign Desktop has no command line login: the script installs it, starts it and types the account's
# e-mail and a one-time code into its login window. The code is computed from the token's TOTP seed (the
# otpauth:// address behind the QR code shown when the SimplySign mobile app is activated).
#
# Environment:
#   CERTUM_EMAIL   the SimplySign account's e-mail
#   CERTUM_TOTP    the TOTP seed: base32, or the whole otpauth:// address
#   WIN_CERT_SHA1  optional: the certificate's thumbprint; without it the first Certum code signing
#                  certificate with a private key is used
# Writes WIN_CERT_SHA1 to GITHUB_ENV for the build step.
$ErrorActionPreference = 'Stop'

function Get-Totp([string]$seed) {
  $digits = 6; $period = 30
  if ($seed -match '^otpauth://') {
    $query = ($seed -split '\?', 2)[1]
    $params = @{}
    foreach ($pair in $query -split '&') {
      $kv = $pair -split '=', 2
      $params[$kv[0].ToLower()] = [Uri]::UnescapeDataString($kv[1])
    }
    $seed = $params['secret']
    if ($params['digits']) { $digits = [int]$params['digits'] }
    if ($params['period']) { $period = [int]$params['period'] }
  }
  # base32 to bytes
  $alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  $bits = ''
  foreach ($c in ($seed.ToUpper() -replace '[\s=-]', '').ToCharArray()) {
    $i = $alphabet.IndexOf($c)
    if ($i -lt 0) { throw "certum-login: CERTUM_TOTP is not base32" }
    $bits += [Convert]::ToString($i, 2).PadLeft(5, '0')
  }
  $key = New-Object byte[] ([Math]::Floor($bits.Length / 8))
  for ($i = 0; $i -lt $key.Length; $i++) { $key[$i] = [Convert]::ToByte($bits.Substring($i * 8, 8), 2) }
  $counter = [long][Math]::Floor([DateTimeOffset]::UtcNow.ToUnixTimeSeconds() / $period)
  $msg = [BitConverter]::GetBytes($counter)
  if ([BitConverter]::IsLittleEndian) { [Array]::Reverse($msg) }
  $hmac = New-Object System.Security.Cryptography.HMACSHA1 (, $key)
  $hash = $hmac.ComputeHash($msg)
  $offset = $hash[$hash.Length - 1] -band 0x0f
  $code = (([int]$hash[$offset] -band 0x7f) -shl 24) -bor ([int]$hash[$offset + 1] -shl 16) -bor ([int]$hash[$offset + 2] -shl 8) -bor [int]$hash[$offset + 3]
  return ($code % [int][Math]::Pow(10, $digits)).ToString().PadLeft($digits, '0')
}

# `certum-login.ps1 -Totp <seed>` only prints the current code (to compare with the phone's app)
if ($args.Count -eq 2 -and $args[0] -eq '-Totp') { Get-Totp $args[1]; exit 0 }

if (-not $env:CERTUM_EMAIL -or -not $env:CERTUM_TOTP) { throw 'certum-login: CERTUM_EMAIL and CERTUM_TOTP are needed' }

function Find-Certificate {
  Get-ChildItem Cert:\CurrentUser\My | Where-Object {
    $_.HasPrivateKey -and $_.NotAfter -gt (Get-Date) -and
    ($(if ($env:WIN_CERT_SHA1) { $_.Thumbprint -eq ($env:WIN_CERT_SHA1 -replace '\s', '').ToUpper() }
       else { $_.Issuer -match 'Certum' -and ($_.EnhancedKeyUsageList.ObjectId -contains '1.3.6.1.5.5.7.3.3') }))
  } | Select-Object -First 1
}

$exe = Get-ChildItem 'C:\Program Files*\Certum\SimplySign Desktop\SimplySignDesktop.exe' -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $exe) {
  Write-Host 'Installing SimplySign Desktop'
  winget install --id Certum.SmartSignSimplySignDesktop --exact --silent --accept-package-agreements --accept-source-agreements --disable-interactivity
  $exe = Get-ChildItem 'C:\Program Files*\Certum\SimplySign Desktop\SimplySignDesktop.exe' -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $exe) { throw 'certum-login: SimplySign Desktop did not install' }
}

$shell = New-Object -ComObject WScript.Shell
for ($try = 1; $try -le 3; $try++) {
  Get-Process SimplySignDesktop -ErrorAction SilentlyContinue | Stop-Process -Force
  $proc = Start-Process $exe.FullName -PassThru
  $focused = $false
  for ($i = 0; $i -lt 40 -and -not $focused; $i++) {
    Start-Sleep -Milliseconds 500
    $focused = $shell.AppActivate($proc.Id) -or $shell.AppActivate('SimplySign')
  }
  if (-not $focused) { Write-Host "SimplySign Desktop window not found (try $try)"; continue }
  Start-Sleep -Seconds 2
  # a fresh code: wait if the current one is about to expire
  if ((30 - ([DateTimeOffset]::UtcNow.ToUnixTimeSeconds() % 30)) -lt 8) { Start-Sleep -Seconds 9 }
  $otp = Get-Totp $env:CERTUM_TOTP
  # the login window: the e-mail field (sometimes already filled), then the token's code
  $shell.SendKeys('^a'); $shell.SendKeys($env:CERTUM_EMAIL -replace '([+^%~(){}\[\]])', '{$1}')
  $shell.SendKeys('{TAB}'); $shell.SendKeys($otp); $shell.SendKeys('{ENTER}')
  for ($i = 0; $i -lt 60; $i++) {
    Start-Sleep -Seconds 1
    $cert = Find-Certificate
    if ($cert) {
      Write-Host "Signing certificate: $($cert.Subject), until $($cert.NotAfter)"
      if ($env:GITHUB_ENV) { "WIN_CERT_SHA1=$($cert.Thumbprint)" | Out-File -FilePath $env:GITHUB_ENV -Append -Encoding utf8 }
      exit 0
    }
  }
  Write-Host "No signing certificate after logging in (try $try)"
}
throw 'certum-login: could not log in to SimplySign'
