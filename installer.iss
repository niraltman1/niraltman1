; ============================================================================
;  Factum IL v1.0.0 — Production Installer (Inno Setup 6)
;
;  Build pipeline:
;    1. .\publish.ps1                    (stages FactumIL_Dist\)
;    2. ISCC.exe installer.iss           (compiles this file)
;
;  Output: dist-package\FactumIL_v1.0.0_Setup.exe
;
;  One-click experience:
;    Install → double-click desktop icon → full app opens (no terminal, no CMD)
;    The WPF shell (FactumIL.Desktop.exe) automatically starts:
;      • Node.js API   (app\node\node.exe  app\api\dist\start.js)
;      • Ollama AI     (ollama.exe serve — if installed)
;      • React SPA     (WebView2 → http://localhost:3001)
; ============================================================================

#define AppName      "Factum IL"
#define AppVersion   "1.0.0"
#define AppPublisher "Altman Law Firm"
#define AppURL       "https://altman-law.co.il"
#define AppExeName   "FactumIL.Desktop.exe"
#define AppGUID      "{{7A3F1B2C-9D4E-4F8A-B6C5-1E2D3A4B5C6D}"

[Setup]
AppId={#AppGUID}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
AppPublisherURL={#AppURL}
DefaultDirName={autopf}\FactumIL
DefaultGroupName={#AppName}
AllowNoIcons=yes
DisableDirPage=no
OutputDir=dist-package
OutputBaseFilename=FactumIL_v1.0.0_Setup
SetupIconFile=assets\logo\factum-il-icon.ico
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
WizardSizePercent=110
PrivilegesRequired=admin
PrivilegesRequiredOverridesAllowed=dialog
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0.17763
UninstallDisplayIcon={app}\{#AppExeName}
CloseApplications=yes
; WebView2 bootstrapper — bundled so no internet required for WebView2
WebView2InstallDir={app}

[Languages]
Name: "hebrew";  MessagesFile: "compiler:Languages\Hebrew.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Messages]
WelcomeLabel1=ברוכים הבאים ל-Factum IL
WelcomeLabel2=מערכת ניהול תיקים ומסמכים משפטיים עם בינה מלאכותית מקומית.%n%nגרסה 1.0.0%n%nלחצו הבא להמשך.
FinishedLabel=ההתקנה הושלמה בהצלחה.%n%nלחצו סיים להפעיל את Factum IL.

[Tasks]
Name: "desktopicon"; Description: "צור קיצור דרך בשולחן העבודה"; GroupDescription: "קיצורי דרך:"; Flags: checkedonce
Name: "startmenu";   Description: "הוסף לתפריט התחל";             GroupDescription: "קיצורי דרך:"; Flags: checkedonce

[Dirs]
; Pre-create the user-writable data directory (no UAC needed at runtime)
Name: "{localappdata}\FactumIL"
Name: "{localappdata}\FactumIL\logs"

[Files]
; ── WPF shell (FactumIL.Desktop.exe + all .NET DLLs + WebView2Loader) ────────
Source: "FactumIL_Dist\shell\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs

; ── Bundled portable Node.js runtime ─────────────────────────────────────────
Source: "FactumIL_Dist\runtime\node.exe"; DestDir: "{app}\app\node"; Flags: ignoreversion

; ── Node.js API server (production build + isolated node_modules) ─────────────
Source: "FactumIL_Dist\backend\*"; DestDir: "{app}\app\api"; Flags: ignoreversion recursesubdirs

; ── React dashboard (compiled static assets served by Express) ────────────────
Source: "FactumIL_Dist\dashboard\*"; DestDir: "{app}\app\dashboard"; Flags: ignoreversion recursesubdirs

; ── SQL migrations (applied once on first boot via MigrationRunner) ───────────
Source: "FactumIL_Dist\migrations\*"; DestDir: "{app}\app\migrations"; Flags: ignoreversion

; ── Legal Registry + PowerShell helpers ──────────────────────────────────────
Source: "FactumIL_Dist\powershell\lib\Legal_Registry.json";  DestDir: "{app}\powershell\lib"; Flags: ignoreversion
Source: "FactumIL_Dist\powershell\lib\Config.ps1";           DestDir: "{app}\powershell\lib"; Flags: ignoreversion skipifsourcedoesntexist
Source: "FactumIL_Dist\powershell\lib\IdentifierParser.ps1"; DestDir: "{app}\powershell\lib"; Flags: ignoreversion skipifsourcedoesntexist

; ── App icon ──────────────────────────────────────────────────────────────────
Source: "assets\logo\factum-il-icon.ico"; DestDir: "{app}\assets\logo"; Flags: ignoreversion

; ── Optional bundled tools (graceful degradation if absent) ──────────────────
Source: "FactumIL_Dist\tools\OllamaSetup.exe"; DestDir: "{app}\tools"; Flags: ignoreversion skipifsourcedoesntexist
Source: "FactumIL_Dist\tools\whisper-fast.exe"; DestDir: "{app}\tools"; Flags: ignoreversion skipifsourcedoesntexist
Source: "FactumIL_Dist\tools\ffmpeg.exe";       DestDir: "{app}\tools"; Flags: ignoreversion skipifsourcedoesntexist

[Icons]
; Start Menu
Name: "{group}\{#AppName}";  Filename: "{app}\{#AppExeName}"; IconFilename: "{app}\assets\logo\factum-il-icon.ico"; Tasks: startmenu
Name: "{group}\הסר התקנה";   Filename: "{uninstallexe}";                                                            Tasks: startmenu
; Desktop shortcut
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppExeName}"; IconFilename: "{app}\assets\logo\factum-il-icon.ico"; Tasks: desktopicon

[Registry]
; FACTUM_IL_ROOT — lets the API and PowerShell find assets without hard-coding paths
Root: HKLM; Subkey: "SYSTEM\CurrentControlSet\Control\Session Manager\Environment"; \
  ValueType: expandsz; ValueName: "FACTUM_IL_ROOT"; ValueData: "{app}"; \
  Flags: preservestringtype uninsdeletevalue

; Optional tool paths
Root: HKLM; Subkey: "SYSTEM\CurrentControlSet\Control\Session Manager\Environment"; \
  ValueType: expandsz; ValueName: "WHISPER_EXE"; ValueData: "{app}\tools\whisper-fast.exe"; \
  Flags: preservestringtype uninsdeletevalue
Root: HKLM; Subkey: "SYSTEM\CurrentControlSet\Control\Session Manager\Environment"; \
  ValueType: expandsz; ValueName: "FFMPEG_EXE"; ValueData: "{app}\tools\ffmpeg.exe"; \
  Flags: preservestringtype uninsdeletevalue

; Persist the legal documents directory chosen by the user
Root: HKLM; Subkey: "SOFTWARE\Factum IL"; ValueType: string; ValueName: "OrgDirectory"; \
  ValueData: "{code:GetOrgDir}"; Flags: uninsdeletevalue
Root: HKLM; Subkey: "SOFTWARE\Factum IL"; ValueType: string; ValueName: "Version"; \
  ValueData: "1.0.0"; Flags: uninsdeletevalue

[Run]
; 1. Install Ollama silently if not already installed
Filename: "{app}\tools\OllamaSetup.exe"; \
  Parameters: "/S"; \
  StatusMsg: "מתקין Ollama (מנוע AI)…"; \
  Flags: waituntilterminated skipifdoesntexist; Check: NeedsOllama

; 2. Post-install bootstrap: hardware check + AI model setup
Filename: "powershell.exe"; \
  Parameters: "-ExecutionPolicy Bypass -NonInteractive -File ""{app}\app\START-HERE.ps1"" -Mode Installer -Silent"; \
  StatusMsg: "מגדיר מנוע AI ומכין את המערכת…"; \
  Flags: runhidden waituntilterminated skipifdoesntexist

; 3. Launch Factum IL after install (user can uncheck this)
Filename: "{app}\{#AppExeName}"; \
  Description: "הפעל את Factum IL עכשיו"; \
  Flags: nowait postinstall skipifsilent skipifdoesntexist

[UninstallDelete]
Type: filesandordirs; Name: "{app}\app\api\node_modules"
Type: filesandordirs; Name: "{localappdata}\FactumIL\logs"

[Code]
var
  OrgDirPage: TInputDirWizardPage;

// ── .NET 8 presence check (three sources) ────────────────────────────────────
function IsDotNet8Installed(): Boolean;
var
  SubKeys: TArrayOfString;
  I: Integer;
  DotNetDir: String;
begin
  Result := False;

  // 1. Filesystem probe
  DotNetDir := ExpandConstant('{pf}') + '\dotnet\shared\Microsoft.NETCore.App';
  if DirExists(DotNetDir) then
  begin
    if RegGetSubkeyNames(HKLM,
        'SOFTWARE\dotnet\Setup\InstalledVersions\x64\sharedfx\Microsoft.NETCore.App',
        SubKeys) then
      for I := 0 to GetArrayLength(SubKeys) - 1 do
        if Copy(SubKeys[I], 1, 2) = '8.' then begin Result := True; Exit; end;
    if FindFirst(DotNetDir + '\8.*', faDirectory) <> 0 then
    begin Result := True; Exit; end;
  end;

  // 2. Registry (MSI)
  if RegGetSubkeyNames(HKLM,
      'SOFTWARE\dotnet\Setup\InstalledVersions\x64\sharedfx\Microsoft.NETCore.App',
      SubKeys) then
    for I := 0 to GetArrayLength(SubKeys) - 1 do
      if Copy(SubKeys[I], 1, 2) = '8.' then begin Result := True; Exit; end;

  // 3. Winget / Microsoft Store key
  if RegGetSubkeyNames(HKLM,
      'SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall',
      SubKeys) then
    for I := 0 to GetArrayLength(SubKeys) - 1 do
      if Pos('dotnet', LowerCase(SubKeys[I])) > 0 then begin Result := True; Exit; end;
end;

function NeedsOllama(): Boolean;
begin
  Result := not FileExists(ExpandConstant('{localappdata}\Programs\Ollama\ollama.exe'))
         and not FileExists(ExpandConstant('{pf}\Ollama\ollama.exe'));
end;

function NeedsWebView2(): Boolean;
var
  Ver: string;
begin
  Result := not RegQueryStringValue(HKLM,
    'SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}',
    'pv', Ver);
end;

// ── Prerequisite checks before the wizard appears ────────────────────────────
function InitializeSetup(): Boolean;
var
  ErrCode: Integer;
begin
  Result := True;

  if NeedsWebView2() then
  begin
    if MsgBox(
      'WebView2 Runtime נדרש להפעלת Factum IL.' + #13#10 +
      'לחץ כן להורדה אוטומטית (2 MB), ולאחר מכן הפעל שוב את המתקין.',
      mbConfirmation, MB_YESNO) = IDYES then
      ShellExec('open',
        'https://go.microsoft.com/fwlink/p/?LinkId=2124703',
        '', '', SW_SHOWNORMAL, ewNoWait, ErrCode);
    MsgBox('התקן את WebView2 Runtime ולאחר מכן הפעל שוב את המתקין.', mbInformation, MB_OK);
    Result := False;
    Exit;
  end;

  if not IsDotNet8Installed() then
  begin
    if MsgBox(
      '.NET 8 Runtime נדרש ואינו מותקן.' + #13#10 +
      'לחץ כן לפתיחת דף ההורדה (חינמי, מ-Microsoft).',
      mbConfirmation, MB_YESNO) = IDYES then
      ShellExec('open',
        'https://dotnet.microsoft.com/en-us/download/dotnet/8.0',
        '', '', SW_SHOW, ewNoWait, ErrCode);
    MsgBox('התקן את .NET 8 Runtime ולאחר מכן הפעל שוב את המתקין.', mbInformation, MB_OK);
    Result := False;
  end;
end;

// ── Custom wizard page: Legal Documents Directory ─────────────────────────────
procedure InitializeWizard;
begin
  OrgDirPage := CreateInputDirPage(
    wpSelectDir,
    'תיקיית המסמכים המשפטיים',
    'בחר את תיקיית מסמכי המשרד הראשית',
    'Factum IL יארגן את כל המסמכים לתיקייה זו.' + #13#10 +
    'ניתן לשנות הגדרה זו מאוחר יותר בהגדרות המערכת.',
    False, ''
  );
  OrgDirPage.Add('');
  OrgDirPage.Values[0] := 'C:\מסמכים משפטיים';
end;

function GetOrgDir(Param: String): String;
begin
  Result := OrgDirPage.Values[0];
  if Result = '' then
    Result := 'C:\מסמכים משפטיים';
end;
