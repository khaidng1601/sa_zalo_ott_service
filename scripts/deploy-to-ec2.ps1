param(
    [Parameter(Mandatory = $true)]
    [string]$HostIp,

    [Parameter(Mandatory = $true)]
    [string]$KeyPath,

    [string]$SshUser = "ubuntu"
)

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$ResolvedKey = (Resolve-Path $KeyPath).Path

Write-Host "==> [1/5] Securing SSH private key permissions on Windows..." -ForegroundColor Cyan
icacls $ResolvedKey /inheritance:r | Out-Null
icacls $ResolvedKey /grant:r "$($env:USERNAME):(R)" | Out-Null

$BundleName = "sa_zalo_ott_bundle.tar.gz"
$ArchivePath = Join-Path $env:TEMP $BundleName
if (Test-Path $ArchivePath) { Remove-Item $ArchivePath -Force }

Write-Host "==> [2/5] Packaging application source bundle..." -ForegroundColor Cyan
Push-Location $RepoRoot
try {
    tar.exe -czf $ArchivePath `
        --exclude="node_modules" `
        --exclude=".git" `
        --exclude="dist" `
        --exclude="build" `
        --exclude="uploads" `
        --exclude="*.pem" `
        --exclude="*.tar.gz" `
        .
    if ($LASTEXITCODE -ne 0) {
        throw "tar.exe failed with exit code $LASTEXITCODE"
    }
} finally {
    Pop-Location
}
$BundleKb = [math]::Round((Get-Item $ArchivePath).Length / 1KB, 1)
Write-Host "    Bundle ready ($BundleKb KB)" -ForegroundColor Green

$SshOpts = @(
    "-n",
    "-i", $ResolvedKey,
    "-o", "BatchMode=yes",
    "-o", "StrictHostKeyChecking=accept-new",
    "-o", "ConnectTimeout=15",
    "-o", "ServerAliveInterval=15"
)

$ScpOpts = @(
    "-i", $ResolvedKey,
    "-o", "BatchMode=yes",
    "-o", "StrictHostKeyChecking=accept-new",
    "-o", "ConnectTimeout=15"
)

Write-Host "==> [3/5] Verifying SSH on $SshUser@$HostIp..." -ForegroundColor Cyan
$Connected = $false
$PrevEap = $ErrorActionPreference
$ErrorActionPreference = "Continue"
for ($i = 1; $i -le 24; $i++) {
    $Out = & ssh.exe @SshOpts "$SshUser@$HostIp" "echo SSH_READY" 2>&1
    if ($LASTEXITCODE -eq 0 -and ($Out -join "`n") -match "SSH_READY") {
        $Connected = $true
        break
    }
    Write-Host "    Waiting for instance SSH daemon ($i/24)..." -ForegroundColor DarkGray
    Start-Sleep -Seconds 5
}
$ErrorActionPreference = $PrevEap

if (-not $Connected) {
    throw "Could not connect to $SshUser@$HostIp via SSH. Check Security Group TCP port 22 and key path."
}
Write-Host "    SSH connection verified!" -ForegroundColor Green

Write-Host "==> [4/5] Uploading $BundleKb KB bundle to EC2..." -ForegroundColor Cyan
$ErrorActionPreference = "Continue"
& ssh.exe @SshOpts "$SshUser@$HostIp" "mkdir -p ~/sa_zalo_ott_service"
if ($LASTEXITCODE -ne 0) { throw "Failed to create remote directory." }

Push-Location $env:TEMP
try {
    # Use relative ./ path so Windows scp.exe never misinterprets C: drive colon as a remote host
    & scp.exe @ScpOpts "./$BundleName" "$SshUser@${HostIp}:~/$BundleName"
    $ScpExit = $LASTEXITCODE
} finally {
    Pop-Location
}
if ($ScpExit -ne 0) { throw "Failed to upload bundle via SCP (exit $ScpExit)." }

& ssh.exe @SshOpts "$SshUser@$HostIp" "tar -xzf ~/$BundleName -C ~/sa_zalo_ott_service && rm -f ~/$BundleName"
if ($LASTEXITCODE -ne 0) { throw "Failed to extract bundle on EC2." }
$ErrorActionPreference = $PrevEap

Remove-Item $ArchivePath -Force -ErrorAction SilentlyContinue
Write-Host "    Bundle uploaded and extracted!" -ForegroundColor Green

Write-Host "==> [5/5] Installing Docker & building containers on EC2..." -ForegroundColor Cyan
$ErrorActionPreference = "Continue"
& ssh.exe @SshOpts "$SshUser@$HostIp" "tr -d '\r' < ~/sa_zalo_ott_service/scripts/ec2-bootstrap.sh | bash"
$RemoteExit = $LASTEXITCODE
$ErrorActionPreference = $PrevEap

if ($RemoteExit -ne 0) {
    throw "Remote deployment failed with exit code $RemoteExit"
}

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Green
Write-Host " DEPLOYMENT COMPLETE!" -ForegroundColor Green
Write-Host " Live App URL (Port 80):   http://$HostIp" -ForegroundColor Green
Write-Host " Live App URL (Port 3000): http://${HostIp}:3000" -ForegroundColor Green
Write-Host " GraphQL API Endpoint:     http://$HostIp/graphql" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
