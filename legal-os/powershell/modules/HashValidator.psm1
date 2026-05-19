#Requires -Version 5.1
<#
.SYNOPSIS
    File integrity hashing module for Legal-OS.
    Uses SHA-256 exclusively as the canonical hash algorithm.
#>
Set-StrictMode -Version Latest

function Get-FileHashSHA256 {
    <#
    .SYNOPSIS
        Computes the SHA-256 hash of a file and returns the hex string (lowercase).
    #>
    [CmdletBinding()]
    [OutputType([string])]
    param(
        [Parameter(Mandatory, ValueFromPipeline)] [string] $FilePath
    )
    process {
        if (-not (Test-Path -LiteralPath $FilePath -PathType Leaf)) {
            throw "File not found: $FilePath"
        }
        $hash = Get-FileHash -LiteralPath $FilePath -Algorithm SHA256
        return $hash.Hash.ToLowerInvariant()
    }
}

function Assert-FileIntegrity {
    <#
    .SYNOPSIS
        Throws if the file's current hash does not match the expected hash.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)] [string] $FilePath,
        [Parameter(Mandatory)] [string] $ExpectedHash
    )
    $actual = Get-FileHashSHA256 -FilePath $FilePath
    if ($actual -ne $ExpectedHash.ToLowerInvariant()) {
        throw "Integrity check failed for '$FilePath'.`nExpected: $ExpectedHash`nActual:   $actual"
    }
}

function Compare-FileHash {
    <#
    .SYNOPSIS
        Returns $true if both files have the same SHA-256 hash.
    #>
    [CmdletBinding()]
    [OutputType([bool])]
    param(
        [Parameter(Mandatory)] [string] $FilePathA,
        [Parameter(Mandatory)] [string] $FilePathB
    )
    $hashA = Get-FileHashSHA256 -FilePath $FilePathA
    $hashB = Get-FileHashSHA256 -FilePath $FilePathB
    return $hashA -eq $hashB
}

Export-ModuleMember -Function Get-FileHashSHA256, Assert-FileIntegrity, Compare-FileHash
