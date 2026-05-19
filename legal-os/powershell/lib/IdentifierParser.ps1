#Requires -Version 5.1
<#
.SYNOPSIS
    Factum IL — Legal Case Identifier Parser
    Dot-sourced by FactumIL.psm1 and used by 04-Parse-Identifiers.ps1.

.DESCRIPTION
    Parses Israeli court case identifiers into structured records:

    CaseType   — the type of legal proceeding (civil, criminal, family, etc.)
    CourtCode  — the abbreviated court designation extracted from the prefix
    CaseNumber — the numeric docket number
    Year       — the two- or four-digit case year

    CLASSIFICATION RULES
    ────────────────────
    Prefix "ת"א" (תיק אזרחי / Civil Case):
        MUST be classified as CaseType = 'civil'.
        "ת"א" is the official abbreviation for תיק אזרחי in the Israeli court
        registry (Net HaMishpat).  It is NEVER treated as a geographic reference
        to Tel Aviv (תל אביב) in this parser.  The two strings are orthographically
        identical in shorthand but contextually unambiguous inside a case identifier.

    Procedure Code 32 (סדר דין רגיל — Civil Standard Procedure):
        When a case record carries procedure_code = '32', the procedure_type
        attribute MUST be set to 'civil_standard'.  This is a strict mapping;
        no fallback to the generic 'civil' bucket is permitted for code 32.

    All other prefix → type mappings follow the Israeli court abbreviation table
    (Net HaMishpat, updated 2024).
#>

Set-StrictMode -Version Latest

# ─────────────────────────────────────────────────────────────────────────────
#  Prefix → CaseType map
#  ת"א  is explicitly 'civil' (NOT a location). This is the central correction.
# ─────────────────────────────────────────────────────────────────────────────
$Script:FactumIL_PrefixMap = [ordered]@{
    # Civil cases — ת"א must be first entry so it short-circuits location checks
    'ת"א'   = 'civil'        # תיק אזרחי — Civil Case (STRICT: not Tel Aviv)
    "ת'א"   = 'civil'        # alternate geresh style
    'תא'    = 'civil'        # without punctuation (OCR artefact)
    'ת.א'   = 'civil'        # period-separated variant

    # Criminal cases
    'ת"פ'   = 'criminal'     # תיק פלילי
    "ת'פ"   = 'criminal'
    'תפ'    = 'criminal'
    'ת.פ'   = 'criminal'
    'ע"פ'   = 'criminal'     # ערעור פלילי (criminal appeal)
    "ע'פ"   = 'criminal'

    # Civil appeals
    'ע"א'   = 'civil'        # ערעור אזרחי (civil appeal)
    "ע'א"   = 'civil'
    'ע.א'   = 'civil'

    # Family cases
    'תמ"ש'  = 'family'       # תיק משפחה
    'תמש'   = 'family'
    'בע"מ'  = 'family'       # בית משפט לענייני משפחה

    # Administrative
    'עת"מ'  = 'administrative'   # עתירה מנהלית
    'עתמ'   = 'administrative'
    'עמ"נ'  = 'administrative'

    # Traffic
    'ת"ק'   = 'traffic_administrative'  # תיק קנסות (traffic fines)
    "ת'ק"   = 'traffic_administrative'
    'תק'    = 'traffic_administrative'
    'עמ"ת'  = 'traffic_criminal'        # ערעור מנהלי תעבורה

    # High Court
    'בג"ץ'  = 'administrative'   # בית משפט גבוה לצדק
    'בגץ'   = 'administrative'

    # Insolvency
    'פש"ר'  = 'insolvency'       # פשיטת רגל
    'פשר'   = 'insolvency'
    'כינ'   = 'insolvency'       # כינוס נכסים

    # Labour
    'ע"ב'   = 'labour'           # ערעור בית דין לעבודה
    'בל'    = 'labour'           # בית לעבודה
}

# ─────────────────────────────────────────────────────────────────────────────
#  Procedure code → procedure_type map
#  Code 32 is STRICTLY 'civil_standard' (סדר דין רגיל). No exceptions.
# ─────────────────────────────────────────────────────────────────────────────
$Script:FactumIL_ProcedureCodeMap = @{
    '1'  = 'civil'                    # כללי (general civil)
    '2'  = 'civil'                    # אזרחי בסיסי
    '10' = 'criminal'                 # פלילי
    '11' = 'criminal'                 # פלילי מחוזי
    '20' = 'traffic_administrative'   # תעבורה מנהלית
    '21' = 'traffic_criminal'         # תעבורה פלילי
    '30' = 'civil'                    # אזרחי מחוזי
    '31' = 'civil'                    # תביעה קטנה
    '32' = 'civil_standard'           # סדר דין רגיל — STRICT mapping, no fallback
    '33' = 'civil'                    # אזרחי מהיר
    '40' = 'family'                   # משפחה
    '50' = 'administrative'           # מנהלי
    '60' = 'insolvency'               # חדלות פירעון / פשיטת רגל
    '70' = 'labour'                   # עבודה
}

# ─────────────────────────────────────────────────────────────────────────────
#  Regex pattern for a valid Israeli case identifier
#  Format: <PREFIX> <NUMBER>/<YEAR>
#  Examples: ת"א 1234/24   ת"פ 56789/2023   בג"ץ 100/24
# ─────────────────────────────────────────────────────────────────────────────
$Script:FactumIL_CaseIdRegex = [regex]::new(
    # PREFIX: Hebrew abbreviation (letters + geresh/gershayim/period)
    "(?<Prefix>[א-ת""'.]+)" +
    '\s+' +
    # CASE NUMBER: digits
    '(?<Number>\d+)' +
    '/' +
    # YEAR: 2 or 4 digits
    '(?<Year>\d{2}(?:\d{2})?)',
    [System.Text.RegularExpressions.RegexOptions]::None
)

# ─────────────────────────────────────────────────────────────────────────────
#  Public function: Parse-CaseIdentifier
# ─────────────────────────────────────────────────────────────────────────────
function Parse-CaseIdentifier {
    <#
    .SYNOPSIS
        Parses a raw Israeli case identifier string into a structured object.

    .PARAMETER RawIdentifier
        The raw case identifier string, e.g. 'ת"א 1234/24' or 'ת"פ 56789/2023'.

    .PARAMETER ProcedureCode
        Optional Net HaMishpat numeric procedure code (e.g. '32').
        When supplied, it OVERRIDES the prefix-derived CaseType for the
        ProcedureType attribute.  Code '32' always yields 'civil_standard'.

    .OUTPUTS
        [PSCustomObject] with properties:
          RawIdentifier  — original input string
          Prefix         — extracted prefix (e.g. 'ת"א')
          CaseNumber     — numeric docket string (e.g. '1234')
          Year           — case year string (e.g. '24' or '2024')
          CaseType       — canonical case type (e.g. 'civil')
          ProcedureType  — procedure type, respecting code-32 rule
          ProcedureCode  — the raw procedure code if provided
          IsValid        — $true if parsing succeeded
          ParseWarnings  — array of non-fatal diagnostic strings

    .EXAMPLE
        Parse-CaseIdentifier -RawIdentifier 'ת"א 1234/24'
        # Returns: CaseType='civil', ProcedureType='civil', Prefix='ת"א'

    .EXAMPLE
        Parse-CaseIdentifier -RawIdentifier 'ת"א 1234/24' -ProcedureCode '32'
        # Returns: CaseType='civil', ProcedureType='civil_standard'

    .EXAMPLE
        Parse-CaseIdentifier -RawIdentifier 'ת"פ 56789/2023'
        # Returns: CaseType='criminal', ProcedureType='criminal'
    #>
    [OutputType([PSCustomObject])]
    [CmdletBinding()]
    param(
        [Parameter(Mandatory, ValueFromPipeline)]
        [string]$RawIdentifier,

        [Parameter()]
        [string]$ProcedureCode = ''
    )

    process {
        $warnings = [System.Collections.Generic.List[string]]::new()

        $result = [PSCustomObject]@{
            RawIdentifier = $RawIdentifier
            Prefix        = ''
            CaseNumber    = ''
            Year          = ''
            CaseType      = 'civil'      # safe default
            ProcedureType = 'civil'
            ProcedureCode = $ProcedureCode
            IsValid       = $false
            ParseWarnings = $warnings
        }

        if ([string]::IsNullOrWhiteSpace($RawIdentifier)) {
            $warnings.Add('Empty identifier string')
            return $result
        }

        $m = $Script:FactumIL_CaseIdRegex.Match($RawIdentifier.Trim())

        if (-not $m.Success) {
            $warnings.Add("Could not parse identifier format: '$RawIdentifier'")
            return $result
        }

        $prefix     = $m.Groups['Prefix'].Value.Trim()
        $caseNumber = $m.Groups['Number'].Value
        $year       = $m.Groups['Year'].Value

        $result.Prefix     = $prefix
        $result.CaseNumber = $caseNumber
        $result.Year       = $year
        $result.IsValid    = $true

        # ── Step 1: resolve CaseType from prefix ──────────────────────────────
        $caseType = $Script:FactumIL_PrefixMap[$prefix]

        if ($null -eq $caseType) {
            # Prefix not in map — warn but keep 'civil' default
            $warnings.Add("Unknown prefix '$prefix' — defaulting to 'civil'")
            $caseType = 'civil'
        }

        $result.CaseType = $caseType

        # ── Step 2: resolve ProcedureType ─────────────────────────────────────
        # If a procedure code is provided, it takes strict precedence.
        # Code '32' is ALWAYS 'civil_standard' — no override permitted.
        if ($ProcedureCode -ne '') {
            $mapped = $Script:FactumIL_ProcedureCodeMap[$ProcedureCode]
            if ($null -ne $mapped) {
                $result.ProcedureType = $mapped
            } else {
                $warnings.Add("Unknown procedure code '$ProcedureCode' — using prefix-derived type")
                $result.ProcedureType = $caseType
            }
        } else {
            # No code supplied: procedure type mirrors case type
            $result.ProcedureType = $caseType
        }

        return $result
    }
}

# ─────────────────────────────────────────────────────────────────────────────
#  Public function: Get-CaseTypeFromPrefix
#  Lightweight helper for callers that only need the type string.
# ─────────────────────────────────────────────────────────────────────────────
function Get-CaseTypeFromPrefix {
    <#
    .SYNOPSIS
        Returns the canonical CaseType for a given Hebrew case prefix.

    .DESCRIPTION
        "ת"א" always returns 'civil'. Never 'location'. Never 'city'.
        "ת"פ" always returns 'criminal'.

    .PARAMETER Prefix
        The Hebrew case prefix string.

    .OUTPUTS
        [string] canonical case type, or 'civil' if unknown.
    #>
    [OutputType([string])]
    param([Parameter(Mandatory)][string]$Prefix)

    $type = $Script:FactumIL_PrefixMap[$Prefix.Trim()]
    if ($null -eq $type) { return 'civil' }
    return $type
}

# ─────────────────────────────────────────────────────────────────────────────
#  Public function: Get-ProcedureTypeFromCode
# ─────────────────────────────────────────────────────────────────────────────
function Get-ProcedureTypeFromCode {
    <#
    .SYNOPSIS
        Returns the canonical ProcedureType for a given procedure code.
        Code '32' strictly returns 'civil_standard' (סדר דין רגיל).

    .PARAMETER Code
        The numeric procedure code string (e.g. '32').

    .OUTPUTS
        [string] canonical procedure_type, or $null if unknown.
    #>
    [OutputType([string])]
    param([Parameter(Mandatory)][string]$Code)

    return $Script:FactumIL_ProcedureCodeMap[$Code]
}

Export-ModuleMember -Function @(
    'Parse-CaseIdentifier',
    'Get-CaseTypeFromPrefix',
    'Get-ProcedureTypeFromCode'
) -Variable @(
    'FactumIL_PrefixMap',
    'FactumIL_ProcedureCodeMap',
    'FactumIL_CaseIdRegex'
)
