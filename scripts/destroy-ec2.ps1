param(
    [string]$Region = "ap-southeast-2",
    [string]$KeyName = "sa-zalo-ott-key",
    [string]$SecurityGroupName = "sa-zalo-ott-sg",
    [string]$InstanceName = "sa-zalo-ott-server"
)

$ErrorActionPreference = "Stop"
$AwsFound = Get-Command aws -ErrorAction SilentlyContinue
$AwsCmd = if ($AwsFound) { $AwsFound.Source } else { $null }
if (-not $AwsCmd -and (Test-Path "C:\Program Files\Amazon\AWSCLIV2\aws.exe")) {
    $AwsCmd = "C:\Program Files\Amazon\AWSCLIV2\aws.exe"
}
if (-not $AwsCmd) {
    throw "AWS CLI v2 not found."
}

Write-Host "==> Terminating EC2 instances tagged Name=$InstanceName in $Region..." -ForegroundColor Yellow
$InstanceIdsRaw = & $AwsCmd ec2 describe-instances `
    --region $Region `
    --filters "Name=tag:Name,Values=$InstanceName" "Name=instance-state-name,Values=pending,running,stopping,stopped" `
    --query "Reservations[].Instances[].InstanceId" `
    --output text

if ($InstanceIdsRaw -and $InstanceIdsRaw.Trim() -ne "None") {
    $Ids = $InstanceIdsRaw.Trim() -split "\s+"
    & $AwsCmd ec2 terminate-instances --region $Region --instance-ids @Ids | Out-Null
    Write-Host "    Waiting for termination of: $($Ids -join ', ')..." -ForegroundColor Yellow
    & $AwsCmd ec2 wait instance-terminated --region $Region --instance-ids @Ids
    Write-Host "    Instances terminated." -ForegroundColor Green
} else {
    Write-Host "    No active instances found." -ForegroundColor Gray
}

Write-Host "==> Deleting Security Group '$SecurityGroupName'..." -ForegroundColor Yellow
& $AwsCmd ec2 delete-security-group --region $Region --group-name $SecurityGroupName 2>$null | Out-Null

Write-Host "==> Deleting Key Pair '$KeyName'..." -ForegroundColor Yellow
& $AwsCmd ec2 delete-key-pair --region $Region --key-name $KeyName 2>$null | Out-Null

Write-Host "All AWS EC2 resources for sa_zalo_ott_service have been cleanly destroyed ($0 ongoing cost)." -ForegroundColor Green
