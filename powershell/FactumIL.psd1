@{
    ModuleVersion     = '1.0.0'
    GUID              = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
    Author            = 'Factum IL Team'
    CompanyName       = 'Factum IL'
    Copyright         = '(c) 2024 Factum IL. All rights reserved.'
    Description       = 'Factum IL PowerShell automation suite for local-first legal document management.'
    PowerShellVersion = '5.1'

    RootModule        = 'FactumIL.psm1'

    FunctionsToExport = @(
        # Logger
        'Write-LegalLog', 'Initialize-Logger', 'Get-LogPath',
        # StateMachine
        'Invoke-StateTransition', 'Get-DocumentState', 'Assert-ValidTransition',
        # ActionLog
        'Write-ActionLog', 'Get-ActionLog', 'Invoke-RollbackAction',
        # ManifestSnapshot
        'New-ManifestSnapshot', 'Get-ManifestSnapshot', 'Restore-FromManifest',
        # HashValidator
        'Get-FileHashSHA256', 'Assert-FileIntegrity', 'Compare-FileHash'
    )

    PrivateData       = @{
        PSData = @{
            Tags        = @('Legal','OCR','Document','Management','Hebrew','SQLite')
            ProjectUri  = 'https://github.com/factum-il/factum-il'
            ReleaseNotes = 'Phase 1: Initial scaffold with Logger, StateMachine, ActionLog, ManifestSnapshot, HashValidator.'
        }
    }
}
