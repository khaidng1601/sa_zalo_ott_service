Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location (Join-Path $scriptDir "chatter-mobile")

npx expo login
Set-Content -Path .env -Value "EXPO_PUBLIC_API_URL=http://3.26.48.153:3000"
npx expo start --tunnel