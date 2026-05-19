#Requires -Version 5.1
<#
.SYNOPSIS
    Production-grade OCR pipeline for Factum IL.
    Handles PDF extraction, image preprocessing, automatic rotation correction,
    DPI normalization, quality scoring, multi-language support, and result caching.
#>
Set-StrictMode -Version Latest

$Script:DefaultLanguages   = 'heb+eng'
$Script:DefaultDPI         = 300
$Script:MinAcceptableDPI   = 150
$Script:QualityThreshold   = 0.60    # minimum acceptable OCR confidence
$Script:TesseractPSM       = 6       # Uniform block of text (best for legal docs)
$Script:MaxPageWorkers     = 4       # parallel page workers

# ─────────────────────────────────────────────
#  Prerequisites
# ─────────────────────────────────────────────
function Assert-OCRPrerequisites {
    $missing = @()
    foreach ($tool in @('tesseract','gs','pdftotext')) {
        if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
            $missing += $tool
        }
    }
    if ($missing.Count -gt 0) {
        throw "OCR prerequisites missing: $($missing -join ', '). Run START-HERE.ps1 -Mode Repair."
    }
}

# ─────────────────────────────────────────────
#  OCR Cache check
# ─────────────────────────────────────────────
function Get-CachedOCRResult {
    param([string]$DatabasePath, [string]$FileHash)
    if (-not (Get-Command sqlite3 -ErrorAction SilentlyContinue)) { return $null }
    $hashEsc = $FileHash -replace "'", "''"
    $row = sqlite3 -separator "`t" $DatabasePath @"
SELECT ocr_text, confidence, page_count FROM OCRCache WHERE file_hash = '$hashEsc' LIMIT 1;
"@
    if (-not $row) { return $null }
    $parts = $row -split "`t"
    return @{ Text = $parts[0]; Confidence = [double]$parts[1]; PageCount = [int]$parts[2] }
}

function Save-OCRCache {
    param(
        [string]$DatabasePath,
        [string]$FileHash,
        [string]$OcrText,
        [double]$Confidence,
        [int]$PageCount,
        [int]$ProcessingMs,
        [string]$Language = $Script:DefaultLanguages
    )
    if (-not (Get-Command sqlite3 -ErrorAction SilentlyContinue)) { return }
    $hashEsc = $FileHash  -replace "'", "''"
    $textEsc = $OcrText   -replace "'", "''"
    $langEsc = $Language  -replace "'", "''"
    $tesVer  = (tesseract --version 2>&1 | Select-Object -First 1) -replace "'", "''"

    sqlite3 $DatabasePath @"
INSERT OR REPLACE INTO OCRCache
  (file_hash, ocr_text, page_count, confidence, language, tesseract_ver, processing_ms)
VALUES
  ('$hashEsc', '$textEsc', $PageCount, $Confidence, '$langEsc', '$tesVer', $ProcessingMs);
"@
}

# ─────────────────────────────────────────────
#  Image preprocessing helpers
# ─────────────────────────────────────────────
function Invoke-ImagePreprocess {
    <#
    .SYNOPSIS
        Preprocesses an image for OCR:
        - Converts to greyscale
        - Normalises DPI to target
        - Returns path to preprocessed temp file
    #>
    param(
        [Parameter(Mandatory)] [string] $ImagePath,
        [int] $TargetDPI = $Script:DefaultDPI
    )
    $ext  = [System.IO.Path]::GetExtension($ImagePath)
    $tmp  = [System.IO.Path]::GetTempFileName() -replace '\.tmp$', $ext
    # Use Ghostscript to normalise DPI and convert to greyscale
    $args = @(
        '-dBATCH', '-dNOPAUSE', '-dQUIET',
        '-sDEVICE=pnggray',
        "-r${TargetDPI}",
        "-sOutputFile=`"$tmp`"",
        "`"$ImagePath`""
    )
    $gs = if (Get-Command gswin64c -ErrorAction SilentlyContinue) { 'gswin64c' } else { 'gs' }
    & $gs @args 2>&1 | Out-Null
    if (-not (Test-Path $tmp) -or (Get-Item $tmp).Length -eq 0) {
        Remove-Item $tmp -Force -ErrorAction SilentlyContinue
        return $ImagePath  # fallback to original
    }
    return $tmp
}

function Get-RotationAngle {
    <#
    .SYNOPSIS
        Uses Tesseract OSD to detect the document rotation angle.
        Returns 0, 90, 180, or 270.
    #>
    param([string] $ImagePath)
    $osdOut = [System.IO.Path]::GetTempFileName()
    try {
        tesseract `"$ImagePath`" `"$($osdOut -replace '\.tmp$','')`" --psm 0 -c 'min_characters_to_try=10' 2>&1 | Out-Null
        $osdFile = $osdOut -replace '\.tmp$','.txt'
        if (Test-Path $osdFile) {
            $content = Get-Content $osdFile -Raw
            if ($content -match 'Rotate:\s*(\d+)') {
                return [int]$Matches[1]
            }
        }
    } catch { }
    finally {
        @($osdOut, ($osdOut -replace '\.tmp$','.txt')) |
            ForEach-Object { Remove-Item $_ -Force -ErrorAction SilentlyContinue }
    }
    return 0
}

function Invoke-RotationCorrection {
    <#
    .SYNOPSIS
        Rotates an image by the specified angle using Ghostscript.
        Returns path to rotated temp file (same ext as input).
    #>
    param(
        [Parameter(Mandatory)] [string] $ImagePath,
        [Parameter(Mandatory)] [int]    $Angle
    )
    if ($Angle -eq 0) { return $ImagePath }

    $ext = [System.IO.Path]::GetExtension($ImagePath)
    $tmp = [System.IO.Path]::GetTempFileName() -replace '\.tmp$', $ext

    $gs = if (Get-Command gswin64c -ErrorAction SilentlyContinue) { 'gswin64c' } else { 'gs' }
    & $gs -dBATCH -dNOPAUSE -dQUIET `-sDEVICE=png16m `
          "-c `"<< /Orientation $($Angle / 90) >> setpagedevice`"" `
          "-f `"$ImagePath`"" "-sOutputFile=`"$tmp`"" 2>&1 | Out-Null

    if (Test-Path $tmp) { return $tmp }
    return $ImagePath
}

# ─────────────────────────────────────────────
#  Quality scoring
# ─────────────────────────────────────────────
function Get-OCRQualityScore {
    <#
    .SYNOPSIS
        Computes a 0.0–1.0 quality score based on:
        - character confidence (Tesseract hocr mean confidence)
        - text density (non-whitespace ratio)
        - Hebrew character presence
    #>
    param(
        [string] $OcrText,
        [string] $HocrPath = ''
    )
    if (-not $OcrText -or $OcrText.Trim().Length -eq 0) { return 0.0 }

    # Text density score
    $total    = [Math]::Max($OcrText.Length, 1)
    $nonWs    = ($OcrText -replace '\s','').Length
    $density  = [Math]::Min([double]$nonWs / $total, 1.0)

    # Hebrew character presence (Unicode range 0x0590–0x05FF)
    $hebrewCount = ($OcrText -replace '[^֐-׿]','').Length
    $hebrewScore = [Math]::Min([double]$hebrewCount / [Math]::Max($nonWs, 1), 1.0)

    # Word-level plausibility (average word length 2–15 chars)
    $words = $OcrText -split '\s+' | Where-Object { $_.Length -gt 0 }
    $avgWordLen = if ($words.Count -gt 0) {
        ($words | Measure-Object -Property Length -Average).Average
    } else { 0 }
    $wordScore = if ($avgWordLen -ge 2 -and $avgWordLen -le 15) { 1.0 } elseif ($avgWordLen -gt 0) { 0.5 } else { 0.0 }

    # Parse mean confidence from hocr if available
    $hocrConfidence = 0.75  # default
    if ($HocrPath -and (Test-Path $HocrPath)) {
        $hocrContent = Get-Content $HocrPath -Raw
        $confidences = [regex]::Matches($hocrContent, "x_wconf\s+(\d+)") |
                       ForEach-Object { [double]$_.Groups[1].Value }
        if ($confidences.Count -gt 0) {
            $hocrConfidence = ($confidences | Measure-Object -Average).Average / 100.0
        }
    }

    $score = ($density * 0.25) + ($wordScore * 0.25) + ($hocrConfidence * 0.35) + ($hebrewScore * 0.15)
    return [Math]::Round([Math]::Min($score, 1.0), 4)
}

# ─────────────────────────────────────────────
#  PDF extraction (pdftotext fast path)
# ─────────────────────────────────────────────
function Invoke-PDFTextExtraction {
    <#
    .SYNOPSIS
        Attempts native text extraction from a PDF using pdftotext.
        Returns $null if the PDF is image-only.
    #>
    param([Parameter(Mandatory)] [string] $PdfPath)
    $tmp = [System.IO.Path]::GetTempFileName() -replace '\.tmp$','.txt'
    try {
        pdftotext -enc UTF-8 -layout `"$PdfPath`" `"$tmp`" 2>&1 | Out-Null
        if (Test-Path $tmp) {
            $text = Get-Content $tmp -Raw -Encoding UTF8
            if ($text -and $text.Trim().Length -gt 50) {
                return $text
            }
        }
        return $null
    } finally {
        Remove-Item $tmp -Force -ErrorAction SilentlyContinue
    }
}

# ─────────────────────────────────────────────
#  PDF → images via Ghostscript
# ─────────────────────────────────────────────
function Convert-PDFToImages {
    param(
        [Parameter(Mandatory)] [string] $PdfPath,
        [string] $OutputDir,
        [int]    $DPI = $Script:DefaultDPI
    )
    if (-not (Test-Path $OutputDir)) {
        New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
    }
    $gs = if (Get-Command gswin64c -ErrorAction SilentlyContinue) { 'gswin64c' } else { 'gs' }
    & $gs -dBATCH -dNOPAUSE -dQUIET -sDEVICE=pnggray "-r$DPI" `
          "-sOutputFile=`"$OutputDir\page_%04d.png`"" `"$PdfPath`"" 2>&1 | Out-Null

    return Get-ChildItem -Path $OutputDir -Filter 'page_*.png' | Sort-Object Name
}

# ─────────────────────────────────────────────
#  Core OCR function
# ─────────────────────────────────────────────
function Invoke-OCR {
    <#
    .SYNOPSIS
        Runs the full OCR pipeline on a file.
        Returns a hashtable with Text, Confidence, PageCount, FromCache.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)] [string] $FilePath,
        [Parameter(Mandatory)] [string] $FileHash,
        [string] $DatabasePath  = '',
        [string] $Languages     = $Script:DefaultLanguages,
        [int]    $DPI           = $Script:DefaultDPI,
        [switch] $SkipCache,
        [switch] $SkipRotation
    )

    Assert-OCRPrerequisites

    $sw = [System.Diagnostics.Stopwatch]::StartNew()

    # Cache hit?
    if ($DatabasePath -and -not $SkipCache) {
        $cached = Get-CachedOCRResult -DatabasePath $DatabasePath -FileHash $FileHash
        if ($cached) {
            Write-LegalLog -Message "OCR: cache hit for hash=$FileHash" -Level DEBUG -Category ocr -AgentSource 'PipelineEngine'
            $cached['FromCache'] = $true
            return $cached
        }
    }

    $ext = [System.IO.Path]::GetExtension($FilePath).ToLowerInvariant()
    $allText = [System.Text.StringBuilder]::new()
    $pageCount = 0
    $tempFiles = [System.Collections.Generic.List[string]]::new()

    try {
        if ($ext -eq '.pdf') {
            # Fast path: native text extraction
            $nativeText = Invoke-PDFTextExtraction -PdfPath $FilePath
            if ($nativeText) {
                $sw.Stop()
                $quality = Get-OCRQualityScore -OcrText $nativeText
                $result  = @{ Text = $nativeText; Confidence = $quality; PageCount = 1; FromCache = $false }
                if ($DatabasePath) {
                    Save-OCRCache -DatabasePath $DatabasePath -FileHash $FileHash `
                                  -OcrText $nativeText -Confidence $quality -PageCount 1 `
                                  -ProcessingMs $sw.ElapsedMilliseconds -Language $Languages
                }
                Write-LegalLog -Message "OCR: native PDF extraction hash=$FileHash confidence=$quality" `
                               -Level INFO -Category ocr -AgentSource 'PipelineEngine'
                return $result
            }

            # Rasterise PDF pages
            $pdfTmpDir = Join-Path $env:TEMP "factuml_ocr_$(Get-Random)"
            $tempFiles.Add($pdfTmpDir)
            $pages = Convert-PDFToImages -PdfPath $FilePath -OutputDir $pdfTmpDir -DPI $DPI
            $pageCount = $pages.Count

            foreach ($page in $pages) {
                $imgPath = $page.FullName
                $imgPath = Invoke-ImagePreprocess -ImagePath $imgPath -TargetDPI $DPI
                $tempFiles.Add($imgPath)

                if (-not $SkipRotation) {
                    $angle = Get-RotationAngle -ImagePath $imgPath
                    if ($angle -ne 0) {
                        $rotated = Invoke-RotationCorrection -ImagePath $imgPath -Angle $angle
                        if ($rotated -ne $imgPath) { $tempFiles.Add($rotated) }
                        $imgPath = $rotated
                        Write-LegalLog -Message "OCR: rotated page by ${angle}° for $($page.Name)" `
                                       -Level DEBUG -Category ocr -AgentSource 'PipelineEngine'
                    }
                }

                $outBase = [System.IO.Path]::GetTempFileName() -replace '\.tmp$',''
                $tempFiles.Add("$outBase.txt")
                $tempFiles.Add("$outBase.hocr")
                tesseract `"$imgPath`" `"$outBase`" -l $Languages --psm $Script:TesseractPSM hocr txt 2>&1 | Out-Null
                if (Test-Path "$outBase.txt") {
                    $pageText = Get-Content "$outBase.txt" -Raw -Encoding UTF8
                    [void]$allText.AppendLine($pageText)
                }
            }
        } else {
            # Single image
            $imgPath = Invoke-ImagePreprocess -ImagePath $FilePath -TargetDPI $DPI
            if ($imgPath -ne $FilePath) { $tempFiles.Add($imgPath) }

            if (-not $SkipRotation) {
                $angle = Get-RotationAngle -ImagePath $imgPath
                if ($angle -ne 0) {
                    $rotated = Invoke-RotationCorrection -ImagePath $imgPath -Angle $angle
                    if ($rotated -ne $imgPath) { $tempFiles.Add($rotated) }
                    $imgPath = $rotated
                }
            }

            $outBase = [System.IO.Path]::GetTempFileName() -replace '\.tmp$',''
            $tempFiles.Add("$outBase.txt")
            $tempFiles.Add("$outBase.hocr")
            tesseract `"$imgPath`" `"$outBase`" -l $Languages --psm $Script:TesseractPSM hocr txt 2>&1 | Out-Null
            if (Test-Path "$outBase.txt") {
                $pageText = Get-Content "$outBase.txt" -Raw -Encoding UTF8
                [void]$allText.Append($pageText)
            }
            $pageCount = 1
        }
    } finally {
        foreach ($tmp in $tempFiles) {
            if (Test-Path $tmp) {
                Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
            }
        }
    }

    $sw.Stop()
    $finalText = $allText.ToString()
    $quality   = Get-OCRQualityScore -OcrText $finalText

    if ($DatabasePath) {
        Save-OCRCache -DatabasePath $DatabasePath -FileHash $FileHash `
                      -OcrText $finalText -Confidence $quality -PageCount $pageCount `
                      -ProcessingMs $sw.ElapsedMilliseconds -Language $Languages
    }

    Write-LegalLog -Message "OCR: completed hash=$FileHash pages=$pageCount confidence=$quality ms=$($sw.ElapsedMilliseconds)" `
                   -Level INFO -Category ocr -AgentSource 'PipelineEngine'

    return @{
        Text        = $finalText
        Confidence  = $quality
        PageCount   = $pageCount
        FromCache   = $false
        DurationMs  = $sw.ElapsedMilliseconds
    }
}

Export-ModuleMember -Function Invoke-OCR, Get-OCRQualityScore, Assert-OCRPrerequisites, `
                               Invoke-ImagePreprocess, Invoke-RotationCorrection, Get-RotationAngle
