param([ValidateSet('Setup','Start','Account','Stop')][string]$Action = 'Start')
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$standDirectory = Join-Path $projectRoot '.local\demo-stand'
$pgBinDirectory = Join-Path $projectRoot '.local\pg18-portable\pgsql\bin'
$clusterDirectory = Join-Path $standDirectory 'cluster'
$localTool = Join-Path $PSScriptRoot 'local-demo.js'
$identitySid = [Security.Principal.WindowsIdentity]::GetCurrent().User
function Assert-PrivateDirectory {
    $standAcl = Get-Acl -LiteralPath $standDirectory
    if (!$standAcl.AreAccessRulesProtected) { throw 'Private directory inheritance must be disabled' }
    foreach ($accessRule in $standAcl.Access) {
        if ($accessRule.AccessControlType -eq 'Allow' -and $accessRule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value -ne $identitySid.Value) { throw 'Private directory has another allowed principal' }
    }
}
function Run-LocalTool([string]$Command) {
    & node $localTool $Command
    if ($LASTEXITCODE -ne 0) { throw 'Local operation failed; do not overwrite the stand' }
}
if ($Action -eq 'Setup') {
    if (Test-Path -LiteralPath $standDirectory) { throw 'Stand already exists; preserve it. Use Start instead.' }
    if (!(Test-Path -LiteralPath (Join-Path $pgBinDirectory 'initdb.exe'))) { throw 'Official portable PostgreSQL 18 binaries required; see LOCAL_DEMO.md' }
    New-Item -ItemType Directory -Path $standDirectory | Out-Null
    $privateAcl = [Security.AccessControl.DirectorySecurity]::new()
    $privateAcl.SetAccessRuleProtection($true,$false)
    $privateAcl.SetOwner($identitySid)
    $privateAcl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($identitySid,'FullControl','ContainerInherit,ObjectInherit','None','Allow'))
    Set-Acl -LiteralPath $standDirectory -AclObject $privateAcl
    Assert-PrivateDirectory
    Run-LocalTool 'secrets'
    & (Join-Path $pgBinDirectory 'initdb.exe') '-D' $clusterDirectory '--username=postgres' '--auth=scram-sha-256' '--encoding=UTF8' '--locale=C' ('--pwfile=' + (Join-Path $standDirectory 'init-password.txt'))
    if ($LASTEXITCODE -ne 0) { throw 'Cluster initialization failed; preserve directory for diagnosis' }
    Run-LocalTool 'configure'
    & (Join-Path $pgBinDirectory 'pg_ctl.exe') '-D' $clusterDirectory '-l' (Join-Path $standDirectory 'postgres.log') '-w' '-t' '20' 'start'
    if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL startup failed' }
    Run-LocalTool 'prepare'
    Write-Host 'Synthetic stand ready. Next: local-demo.ps1 -Action Account, then -Action Start.'
    return
}
Assert-PrivateDirectory
if ($Action -eq 'Account') {
    if ([Console]::IsInputRedirected -or [Console]::IsOutputRedirected) { throw 'Use your interactive terminal; do not pipe or log the password prompt' }
    Write-Host 'Create your first local superadministrator PEDPSY-OWNER. Synthetic stand only.'
    Write-Host 'Choose a unique password, at least 12 characters. Do not send it to chat. MFA remains mandatory.'
    $firstPassword = Read-Host 'Password' -AsSecureString
    $secondPassword = Read-Host 'Repeat password' -AsSecureString
    $firstPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($firstPassword)
    $secondPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secondPassword)
    try {
        $firstPlain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($firstPointer)
        $secondPlain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($secondPointer)
        if ($firstPlain -cne $secondPlain -or $firstPlain.Length -lt 12 -or [Text.Encoding]::UTF8.GetByteCount($firstPlain) -gt 256) { throw 'Password mismatch or invalid length; account not created' }
        $previousPipelineEncoding = $OutputEncoding
        $OutputEncoding = [Text.UTF8Encoding]::new($false)
        @{confirm='FIRST_LOCAL_SYNTHETIC_SUPERADMIN'; password=$firstPlain} | ConvertTo-Json -Compress | & node $localTool bootstrap
        if ($LASTEXITCODE -ne 0) { throw 'First account creation refused; existing accounts remain unchanged' }
    } finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($firstPointer)
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($secondPointer)
        $firstPlain = $null; $secondPlain = $null; $firstPassword.Dispose(); $secondPassword.Dispose()
        if ($null -ne $previousPipelineEncoding) { $OutputEncoding = $previousPipelineEncoding }
    }
    return
}
if ($Action -eq 'Stop') {
    & (Join-Path $pgBinDirectory 'pg_ctl.exe') '-D' $clusterDirectory '-w' '-t' '20' 'stop' '-m' 'fast'
    if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL stop failed; nothing deleted' }
    return
}
& (Join-Path $pgBinDirectory 'pg_ctl.exe') '-D' $clusterDirectory 'status' | Out-Null
if ($LASTEXITCODE -ne 0) {
    & (Join-Path $pgBinDirectory 'pg_ctl.exe') '-D' $clusterDirectory '-l' (Join-Path $standDirectory 'postgres.log') '-w' '-t' '20' 'start'
    if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL startup failed' }
}
Run-LocalTool 'serve'
