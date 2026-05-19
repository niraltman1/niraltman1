#Requires -Version 5.1
<#
.SYNOPSIS
    Pester test suite for Legal-OS PowerShell modules.
    Run with: Invoke-Pester ./tests/powershell/LegalOS.Tests.ps1 -Output Detailed
#>

BeforeAll {
    $repoRoot   = Resolve-Path (Join-Path $PSScriptRoot '..\..')
    $moduleRoot = Join-Path $repoRoot 'legal-os\powershell'

    Import-Module (Join-Path $moduleRoot 'LegalOS.psm1') -Force

    # Temporary SQLite DB for tests
    $Script:TestDbPath = Join-Path $env:TEMP "legal_os_test_$(Get-Random).db"

    # Apply migrations to the test database
    if (Get-Command sqlite3 -ErrorAction SilentlyContinue) {
        $migrationsDir = Join-Path $repoRoot 'legal-os\migrations'
        Get-ChildItem -Path $migrationsDir -Filter '*.sql' | Sort-Object Name | ForEach-Object {
            sqlite3 $Script:TestDbPath ".read `"$($_.FullName)`""
        }
    }
}

AfterAll {
    if (Test-Path $Script:TestDbPath) {
        Remove-Item -Path $Script:TestDbPath -Force
    }
    # Clean WAL files
    @("$Script:TestDbPath-wal","$Script:TestDbPath-shm") | ForEach-Object {
        if (Test-Path $_) { Remove-Item $_ -Force }
    }
}

# ─────────────────────────────────────────────
#  Logger tests
# ─────────────────────────────────────────────
Describe 'Logger' {
    BeforeAll {
        $logDir = Join-Path $env:TEMP "legal_os_log_test_$(Get-Random)"
        Initialize-Logger -LogDirectory $logDir -MinLevel 'DEBUG'
    }

    It 'initialises log directory' {
        Test-Path (Join-Path $env:TEMP 'legal_os_log_test_*') | Should -Be $true
    }

    It 'writes an INFO entry without throwing' {
        { Write-LegalLog -Message 'Test entry' -Level INFO -Category system } | Should -Not -Throw
    }

    It 'writes a WARN entry without throwing' {
        { Write-LegalLog -Message 'Test warning' -Level WARN -Category system } | Should -Not -Throw
    }

    It 'Get-LogPath returns a .jsonl path' {
        $path = Get-LogPath -Category system
        $path | Should -Match '\.jsonl$'
    }
}

# ─────────────────────────────────────────────
#  HashValidator tests
# ─────────────────────────────────────────────
Describe 'HashValidator' {
    BeforeAll {
        $Script:TestFile = Join-Path $env:TEMP "legal_os_hash_$(Get-Random).txt"
        Set-Content -Path $Script:TestFile -Value 'Legal-OS test content' -Encoding UTF8
    }

    AfterAll {
        Remove-Item -Path $Script:TestFile -Force -ErrorAction SilentlyContinue
    }

    It 'computes a 64-char hex SHA-256 hash' {
        $hash = Get-FileHashSHA256 -FilePath $Script:TestFile
        $hash | Should -Match '^[a-f0-9]{64}$'
    }

    It 'returns same hash for same content' {
        $h1 = Get-FileHashSHA256 -FilePath $Script:TestFile
        $h2 = Get-FileHashSHA256 -FilePath $Script:TestFile
        $h1 | Should -BeExactly $h2
    }

    It 'Assert-FileIntegrity passes for correct hash' {
        $hash = Get-FileHashSHA256 -FilePath $Script:TestFile
        { Assert-FileIntegrity -FilePath $Script:TestFile -ExpectedHash $hash } | Should -Not -Throw
    }

    It 'Assert-FileIntegrity throws for wrong hash' {
        { Assert-FileIntegrity -FilePath $Script:TestFile -ExpectedHash 'deadbeef' } | Should -Throw
    }

    It 'Compare-FileHash returns true for identical file' {
        $copy = $Script:TestFile + '.copy'
        Copy-Item $Script:TestFile $copy
        Compare-FileHash -FilePathA $Script:TestFile -FilePathB $copy | Should -Be $true
        Remove-Item $copy -Force
    }

    It 'throws for non-existent file' {
        { Get-FileHashSHA256 -FilePath 'C:\non_existent_legal_os.txt' } | Should -Throw
    }
}

# ─────────────────────────────────────────────
#  StateMachine tests
# ─────────────────────────────────────────────
Describe 'StateMachine' {
    It 'allows DISCOVERED → HASHED' {
        { Assert-ValidTransition -FromState 'DISCOVERED' -ToState 'HASHED' } | Should -Not -Throw
    }

    It 'allows HASHED → OCR_PENDING' {
        { Assert-ValidTransition -FromState 'HASHED' -ToState 'OCR_PENDING' } | Should -Not -Throw
    }

    It 'allows any state → FAILED' {
        $states = @('DISCOVERED','HASHED','OCR_PENDING','OCR_COMPLETE','CLASSIFIED','ENRICHED','REVIEW_PENDING','APPLIED','VERIFIED')
        foreach ($s in $states) {
            { Assert-ValidTransition -FromState $s -ToState 'FAILED' } | Should -Not -Throw
        }
    }

    It 'rejects DISCOVERED → VERIFIED (skip)' {
        { Assert-ValidTransition -FromState 'DISCOVERED' -ToState 'VERIFIED' } | Should -Throw
    }

    It 'rejects VERIFIED → HASHED (regression)' {
        { Assert-ValidTransition -FromState 'VERIFIED' -ToState 'HASHED' } | Should -Throw
    }

    It 'rejects unknown state' {
        { Assert-ValidTransition -FromState 'UNKNOWN_STATE' -ToState 'HASHED' } | Should -Throw
    }

    Context 'With SQLite database' -Skip:((-not (Get-Command sqlite3 -ErrorAction SilentlyContinue)) -or (-not (Test-Path $Script:TestDbPath))) {
        BeforeAll {
            # Insert a test document
            sqlite3 $Script:TestDbPath @"
INSERT INTO Documents (file_hash, original_path, storage_path, filename, extension, file_size_bytes)
VALUES ('aaaa1111', 'C:\test\doc.pdf', 'C:\storage\doc.pdf', 'doc.pdf', 'pdf', 1024);
"@
            $Script:TestDocId = [int](sqlite3 $Script:TestDbPath "SELECT last_insert_rowid();")
        }

        It 'retrieves current state as DISCOVERED' {
            $state = Get-DocumentState -DatabasePath $Script:TestDbPath -DocumentId $Script:TestDocId
            $state | Should -BeExactly 'DISCOVERED'
        }

        It 'transitions DISCOVERED → HASHED atomically' {
            Invoke-StateTransition -DatabasePath $Script:TestDbPath `
                                   -DocumentId $Script:TestDocId `
                                   -ToState 'HASHED' `
                                   -AgentSource 'TestAgent'
            $state = Get-DocumentState -DatabasePath $Script:TestDbPath -DocumentId $Script:TestDocId
            $state | Should -BeExactly 'HASHED'
        }
    }
}

# ─────────────────────────────────────────────
#  ActionLog tests
# ─────────────────────────────────────────────
Describe 'ActionLog' -Skip:((-not (Get-Command sqlite3 -ErrorAction SilentlyContinue)) -or (-not (Test-Path $Script:TestDbPath))) {
    BeforeAll {
        # Insert test document if not present
        sqlite3 $Script:TestDbPath @"
INSERT OR IGNORE INTO Documents (file_hash, original_path, storage_path, filename, extension, file_size_bytes)
VALUES ('bbbb2222', 'C:\test\action_doc.pdf', 'C:\storage\action_doc.pdf', 'action_doc.pdf', 'pdf', 2048);
"@
        $Script:ActionDocId = [int](sqlite3 $Script:TestDbPath "SELECT id FROM Documents WHERE file_hash = 'bbbb2222';")
    }

    It 'writes an action log entry and returns a positive ID' {
        $id = Write-ActionLog -DatabasePath $Script:TestDbPath `
                              -OperationId  ([System.Guid]::NewGuid().ToString()) `
                              -OperationType 'HASH' `
                              -AgentSource  'TestAgent' `
                              -DocumentId   $Script:ActionDocId `
                              -FileHashBefore 'aaa' `
                              -FileHashAfter  'bbb'
        $id | Should -BeGreaterThan 0
    }

    It 'reads back action log entries for the document' {
        $rows = Get-ActionLog -DatabasePath $Script:TestDbPath -DocumentId $Script:ActionDocId
        $rows | Should -Not -BeNullOrEmpty
    }
}

# ─────────────────────────────────────────────
#  ManifestSnapshot tests
# ─────────────────────────────────────────────
Describe 'ManifestSnapshot' -Skip:((-not (Get-Command sqlite3 -ErrorAction SilentlyContinue)) -or (-not (Test-Path $Script:TestDbPath))) {
    BeforeAll {
        sqlite3 $Script:TestDbPath @"
INSERT OR IGNORE INTO Documents (file_hash, original_path, storage_path, filename, extension, file_size_bytes)
VALUES ('cccc3333', 'C:\test\snap_doc.pdf', 'C:\storage\snap_doc.pdf', 'snap_doc.pdf', 'pdf', 4096);
"@
        $Script:SnapDocId = [int](sqlite3 $Script:TestDbPath "SELECT id FROM Documents WHERE file_hash = 'cccc3333';")
    }

    It 'creates a manifest snapshot and returns a UUID' {
        $snapshotId = New-ManifestSnapshot -DatabasePath $Script:TestDbPath `
                                           -DocumentId  $Script:SnapDocId `
                                           -TriggerEvent 'PRE_MOVE'
        $snapshotId | Should -Match '^[0-9a-f-]{36}$'
    }

    It 'retrieves the snapshot data as JSON' {
        $snapshotId = New-ManifestSnapshot -DatabasePath $Script:TestDbPath `
                                           -DocumentId  $Script:SnapDocId `
                                           -TriggerEvent 'PRE_RENAME'
        $json = Get-ManifestSnapshot -DatabasePath $Script:TestDbPath -SnapshotId $snapshotId
        { $json | ConvertFrom-Json } | Should -Not -Throw
    }
}
