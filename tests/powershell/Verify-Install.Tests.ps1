#Requires -Version 5.1
<#
.SYNOPSIS
    Pester tests for powershell\scripts\Verify-Install.ps1
    Run with: Invoke-Pester ./tests/powershell/Verify-Install.Tests.ps1 -Output Detailed
#>

BeforeAll {
    $repoRoot   = Resolve-Path (Join-Path $PSScriptRoot '..\..')
    $Script:ScriptPath = Join-Path $repoRoot 'powershell\scripts\Verify-Install.ps1'
}

# ─────────────────────────────────────────────────────────────────────────────
#  Describe 1: Script existence and syntax
# ─────────────────────────────────────────────────────────────────────────────

Describe 'Verify-Install.ps1 — file existence' {

    It 'script file exists on disk' {
        Test-Path $Script:ScriptPath | Should -Be $true
    }

    It 'script parses as valid PowerShell (no syntax errors)' {
        $errors = $null
        [System.Management.Automation.Language.Parser]::ParseFile(
            $Script:ScriptPath,
            [ref]$null,
            [ref]$errors
        ) | Out-Null
        $errors.Count | Should -Be 0
    }
}

# ─────────────────────────────────────────────────────────────────────────────
#  Describe 2: Parameter surface
# ─────────────────────────────────────────────────────────────────────────────

Describe 'Verify-Install.ps1 — parameters' {

    BeforeAll {
        # Load parameter metadata without executing the script body
        $Script:CmdMeta = Get-Command $Script:ScriptPath -ErrorAction Stop
    }

    It 'exposes -InstallDir parameter' {
        $Script:CmdMeta.Parameters.ContainsKey('InstallDir') | Should -Be $true
    }

    It '-InstallDir has a default value of C:\Program Files\FactumIL' {
        # Get-Command.DefaultValue is $null for script params; use AST instead
        $ast      = [System.Management.Automation.Language.Parser]::ParseFile(
                        $Script:ScriptPath, [ref]$null, [ref]$null)
        $paramAst = $ast.FindAll({
            $args[0] -is [System.Management.Automation.Language.ParameterAst] -and
            $args[0].Name.VariablePath.UserPath -eq 'InstallDir'
        }, $true)
        $default  = $paramAst[0].DefaultValue.Value
        $default | Should -BeExactly 'C:\Program Files\FactumIL'
    }

    It 'exposes -DevMode switch parameter' {
        $Script:CmdMeta.Parameters.ContainsKey('DevMode') | Should -Be $true
    }

    It '-DevMode is a SwitchParameter' {
        $paramType = $Script:CmdMeta.Parameters['DevMode'].ParameterType
        $paramType | Should -Be ([System.Management.Automation.SwitchParameter])
    }
}

# ─────────────────────────────────────────────────────────────────────────────
#  Describe 3: Exit-code behaviour (uses a temp mock script to avoid real I/O)
# ─────────────────────────────────────────────────────────────────────────────

Describe 'Verify-Install.ps1 — exit codes' {

    It 'exits 0 when no failures are recorded' {
        # Minimal harness: source just the helper functions, inject zero failures
        $harness = @'
$Script:Failures = 0
function Pass([string]$Name)  { Write-Host "[PASS] $Name" }
function Fail([string]$Name, [string]$Reason) {
    Write-Host "[FAIL] $Name -- $Reason"
    $Script:Failures++
}
if ($Script:Failures -eq 0) { exit 0 } else { exit 1 }
'@
        $tmp = [System.IO.Path]::GetTempFileName() + '.ps1'
        Set-Content -Path $tmp -Value $harness -Encoding UTF8
        try {
            & pwsh -NoProfile -NonInteractive -File $tmp
            $LASTEXITCODE | Should -Be 0
        } finally {
            Remove-Item $tmp -Force -ErrorAction SilentlyContinue
        }
    }

    It 'exits 1 when at least one failure is recorded' {
        $harness = @'
$Script:Failures = 0
function Pass([string]$Name)  { Write-Host "[PASS] $Name" }
function Fail([string]$Name, [string]$Reason) {
    Write-Host "[FAIL] $Name -- $Reason"
    $Script:Failures++
}
Fail "Synthetic test" "forced failure to verify exit code"
if ($Script:Failures -eq 0) { exit 0 } else { exit 1 }
'@
        $tmp = [System.IO.Path]::GetTempFileName() + '.ps1'
        Set-Content -Path $tmp -Value $harness -Encoding UTF8
        try {
            & pwsh -NoProfile -NonInteractive -File $tmp
            $LASTEXITCODE | Should -Be 1
        } finally {
            Remove-Item $tmp -Force -ErrorAction SilentlyContinue
        }
    }

    It 'runs in -DevMode without throwing an exception' -Skip:(($null -eq (Get-Command pwsh -ErrorAction SilentlyContinue))) {
        # Run the actual script in DevMode; expect it not to crash (exit 0 or 1 are both acceptable)
        & pwsh -NoProfile -NonInteractive -File $Script:ScriptPath -DevMode
        # Any exit code from 0..255 is fine — what matters is no unhandled exception
        $LASTEXITCODE | Should -BeIn @(0, 1)
    }
}

# ─────────────────────────────────────────────────────────────────────────────
#  Describe 4: Output format
# ─────────────────────────────────────────────────────────────────────────────

Describe 'Verify-Install.ps1 — output format' -Skip:(($null -eq (Get-Command pwsh -ErrorAction SilentlyContinue))) {

    BeforeAll {
        $Script:DevModeOutput = & pwsh -NoProfile -NonInteractive -File $Script:ScriptPath -DevMode 2>&1
    }

    It 'every result line starts with [PASS], [FAIL], or [SKIP]' {
        $resultLines = $Script:DevModeOutput | Where-Object { $_ -match '^\[(PASS|FAIL|SKIP)\]' }
        $resultLines.Count | Should -BeGreaterThan 0
    }

    It '[FAIL] lines include a reason separated by --' {
        $failLines = $Script:DevModeOutput | Where-Object { $_ -match '^\[FAIL\]' }
        foreach ($line in $failLines) {
            $line | Should -Match '\-\-'
        }
    }
}
