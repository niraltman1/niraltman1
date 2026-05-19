; ============================================================================
;  Legal-OS 11.0-MAX — Inno Setup Installer Script
;  Compiler: Inno Setup 6.x  (https://jrsoftware.org/isinfo.php)
;  Prerequisites: run apps\desktop\publish.ps1 first to populate LegalOS_Dist\
;  Run: ISCC.exe installer.iss
;  Output: dist-package\LegalOS_11MAX_Installer.exe
; ============================================================================

#define AppName       "Legal-OS"
#define AppVersion    "11.0-MAX"
#define AppPublisher  "Altman Law Firm"
#define AppURL        "https://altman-law.co.il"
#define AppExeName    "shell\LegalOS.Desktop.exe"
#define AppGUID       "{{7A3F1B2C-9D4E-4F8A-B6C5-1E2D3A4B5C6D}"

[Setup]
AppId={#AppGUID}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
AppPublisherURL={#AppURL}
DefaultDirName={autopf}\LegalOS
DefaultGroupName={#AppName}
AllowNoIcons=yes
OutputDir=dist-package
OutputBaseFilename=LegalOS_11MAX_Installer
SetupIconFile=LegalOS_Dist\shell\Resources\icon.ico
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
WizardSizePercent=110
DisableDirPage=no
PrivilegesRequired=admin
PrivilegesRequiredOverridesAllowed=dialog
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0.17763
; Windows 10 1809+ required for WebView2 evergreen

[Languages]
Name: "hebrew"; MessagesFile: "compiler:Languages\Hebrew.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Messages]
; English fallback (Hebrew ISL may not exist on all setups)
WelcomeLabel1=ברוכים הבאים ל-Legal-OS
WelcomeLabel2=מערכת הפעלה משפטית לצרכי משרד עורכי דין אלטמן.%n%nגרסה 11.0-MAX%n%nלחצו הבא להמשך.

[Tasks]
Name: "desktopicon"; Description: "צור קיצור דרך בשולחן העבודה"; GroupDescription: "קיצורי דרך:"; Flags: checkedonce

[Files]
; ── C# WPF shell (LegalOS.Desktop.exe + WebView2 dlls) ───────────────────
Source: "LegalOS_Dist\shell\*";       DestDir: "{app}\shell";      Flags: ignoreversion recursesubdirs

; ── Node.js backend (Express API + production node_modules) ──────────────
Source: "LegalOS_Dist\backend\*";     DestDir: "{app}\backend";    Flags: ignoreversion recursesubdirs

; ── React dashboard static assets (served by Express at /) ───────────────
Source: "LegalOS_Dist\dashboard\*";   DestDir: "{app}\dashboard";  Flags: ignoreversion recursesubdirs

; ── SQL migrations (run by start.ts on first boot via LEGAL_OS_ROOT) ─────
Source: "LegalOS_Dist\migrations\*";  DestDir: "{app}\migrations"; Flags: ignoreversion

; ── Portable Node.js runtime (sovereign offline execution) ───────────────
Source: "LegalOS_Dist\runtime\node.exe"; DestDir: "{app}\runtime"; Flags: ignoreversion

; ── Optional bundled tools (graceful degradation if absent) ──────────────
Source: "dist-package\tools\whisper-fast.exe"; DestDir: "{app}\tools"; Flags: ignoreversion skipifsourcedoesntexist
Source: "dist-package\tools\ffmpeg.exe";       DestDir: "{app}\tools"; Flags: ignoreversion skipifsourcedoesntexist
Source: "dist-package\tools\OllamaSetup.exe";  DestDir: "{app}\tools"; Flags: ignoreversion skipifsourcedoesntexist

[Icons]
Name: "{group}\{#AppName}";         Filename: "{app}\{#AppExeName}"; IconFilename: "{app}\shell\Resources\icon.ico"
Name: "{group}\הסר התקנה";          Filename: "{uninstallexe}"
Name: "{commondesktop}\{#AppName}"; Filename: "{app}\{#AppExeName}"; Tasks: desktopicon; IconFilename: "{app}\shell\Resources\icon.ico"

[Registry]
; Store installation root for PowerShell scripts and API service
Root: HKLM; Subkey: "SYSTEM\CurrentControlSet\Control\Session Manager\Environment"; \
  ValueType: expandsz; ValueName: "LEGAL_OS_ROOT"; ValueData: "{app}"; \
  Flags: preservestringtype uninsdeletevalue
Root: HKLM; Subkey: "SYSTEM\CurrentControlSet\Control\Session Manager\Environment"; \
  ValueType: expandsz; ValueName: "WHISPER_EXE"; ValueData: "{app}\tools\whisper-fast.exe"; \
  Flags: preservestringtype uninsdeletevalue
Root: HKLM; Subkey: "SYSTEM\CurrentControlSet\Control\Session Manager\Environment"; \
  ValueType: expandsz; ValueName: "FFMPEG_EXE"; ValueData: "{app}\tools\ffmpeg.exe"; \
  Flags: preservestringtype uninsdeletevalue

[Run]
; ── 1. Install .NET 8 Desktop Runtime if missing ─────────────────────────
Filename: "{app}\scripts\Install-DotNet8.ps1"; \
  Parameters: "-ExecutionPolicy Bypass -File ""{app}\scripts\Install-DotNet8.ps1"""; \
  StatusMsg: "מתקין .NET 8 Runtime…"; \
  Flags: runhidden; Check: NeedsDotNet8

; ── 2. Install Ollama if missing ──────────────────────────────────────────
Filename: "{app}\tools\OllamaSetup.exe"; \
  Parameters: "/S"; \
  StatusMsg: "מתקין Ollama…"; \
  Flags: waituntilterminated; Check: NeedsOllama

; ── 3. Run post-install: hardware check + AI model setup ─────────────────
Filename: "powershell.exe"; \
  Parameters: "-ExecutionPolicy Bypass -NonInteractive -File ""{app}\scripts\START-HERE.ps1"" -Mode Installer -Silent"; \
  StatusMsg: "מגדיר מנוע AI ומכין את המערכת…"; \
  Flags: runhidden waituntilterminated

; ── 4. Launch app after install (optional checkbox) ──────────────────────
Filename: "{app}\{#AppExeName}"; \
  Description: "הפעל את Legal-OS עכשיו"; \
  Flags: nowait postinstall skipifsilent unchecked

[UninstallDelete]
Type: filesandordirs; Name: "{app}\data"
Type: filesandordirs; Name: "{app}\logs"
Type: filesandordirs; Name: "{app}\_evidence"

[Code]
// ── Dependency checks ────────────────────────────────────────────────────

function NeedsDotNet8: Boolean;
var
  Ver: string;
begin
  Result := not RegQueryStringValue(HKLM,
    'SOFTWARE\dotnet\Setup\InstalledVersions\x64\sharedfx\Microsoft.WindowsDesktop.App',
    '8.0', Ver);
end;

function NeedsOllama: Boolean;
begin
  Result := not FileExists(ExpandConstant('{pf}\Ollama\ollama.exe'))
         and not FileExists(ExpandConstant('{localappdata}\Programs\Ollama\ollama.exe'));
end;

function NeedsWebView2: Boolean;
var
  Ver: string;
begin
  // WebView2 Evergreen is present if this reg key exists
  Result := not RegQueryStringValue(HKLM,
    'SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}',
    'pv', Ver);
end;

// ── Abort if WebView2 is missing and user declines download ──────────────
procedure InitializeWizard;
begin
  if NeedsWebView2 then begin
    if MsgBox('WebView2 Runtime נדרש ל-Legal-OS.' + #13#10 +
              'לחץ כן להורדה אוטומטית, לא לביטול.',
              mbConfirmation, MB_YESNO) = IDYES then begin
      ShellExec('open',
        'https://go.microsoft.com/fwlink/p/?LinkId=2124703',
        '', '', SW_SHOWNORMAL, ewNoWait, 0);
      MsgBox('התקן את WebView2 ולאחר מכן הפעל שוב את המתקין.', mbInformation, MB_OK);
      Abort;
    end else
      Abort;
  end;
end;
