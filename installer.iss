; ============================================================================
;  Factum IL v1.0.0 — Production Installer (Inno Setup 6)
;
;  Build pipeline:
;    1. .\publish.ps1                    (stages FactumIL_Dist\)
;    2. ISCC.exe installer.iss           (compiles the .exe)
;
;  Output: Factum-IL-Setup.exe  (repo root)
;
;  Installed layout at {app}:
;    FactumIL.Desktop.exe          ← WPF launcher (double-click to start)
;    app\node\node.exe             ← portable Node.js runtime
;    app\api\dist\start.js         ← Express API entry point
;    app\api\node_modules\         ← production dependencies
;    app\dashboard\dist\           ← React SPA (served by Express at /)
;    app\migrations\*.sql          ← SQLite schema (applied on first boot)
;    tools\OllamaSetup.exe         ← AI engine installer (optional)
;    tools\MicrosoftEdgeWebview2Setup.exe ← WebView2 bootstrapper
;
;  Runtime data (writable, no UAC):
;    %LOCALAPPDATA%\FactumIL\factum-il.db
;    %LOCALAPPDATA%\FactumIL\logs\
; ============================================================================

#define AppName      "Factum IL"
#define AppVersion   "1.0.0"
#define AppPublisher "Adv. Nir Altman"
#define AppURL       "https://factum-il.com"
#define AppCopyright "Copyright (C) 2026 Adv. Nir Altman. All rights reserved."
#define AppExeName   "FactumIL.Desktop.exe"
#define AppGUID      "{{7A3F1B2C-9D4E-4F8A-B6C5-1E2D3A4B5C6D}"

[Setup]
AppId={#AppGUID}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} {#AppVersion}
AppPublisher={#AppPublisher}
AppPublisherURL={#AppURL}
AppCopyright={#AppCopyright}
VersionInfoProductName={#AppName}
VersionInfoVersion={#AppVersion}
VersionInfoCompany={#AppPublisher}
VersionInfoCopyright={#AppCopyright}
DefaultDirName={autopf}\FactumIL
DefaultGroupName={#AppName}
AllowNoIcons=yes
DisableDirPage=no
OutputDir=.
OutputBaseFilename=Factum-IL-Setup
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
; Pre-create the user-writable data directory — app writes here at runtime (no UAC)
Name: "{localappdata}\FactumIL"
Name: "{localappdata}\FactumIL\logs"

[Files]
; ── WPF shell (FactumIL.Desktop.exe + .NET DLLs + WebView2Loader.dll) ─────────
Source: "FactumIL_Dist\shell\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs

; ── Bundled portable Node.js runtime (no system Node required) ───────────────
Source: "FactumIL_Dist\runtime\node.exe"; DestDir: "{app}\app\node"; Flags: ignoreversion

; ── Express API + workspace packages + node_modules ─────────────────────────
Source: "FactumIL_Dist\backend\*"; DestDir: "{app}\app\api"; Flags: ignoreversion recursesubdirs createallsubdirs

; ── React dashboard (dist\ preserved so API resolves correctly) ──────────────
; API entry (app\api\dist\start.js) resolves dashboard via:
;   join(__dirname, '..', '..', 'dashboard', 'dist')  →  app\dashboard\dist\
; publish.ps1 copies apps\dashboard\dist\* → FactumIL_Dist\dashboard\dist\
; so the installer must use DestDir: {app}\app\dashboard (preserving \dist\ subfolder)
Source: "FactumIL_Dist\dashboard\*"; DestDir: "{app}\app\dashboard"; Flags: ignoreversion recursesubdirs createallsubdirs

; ── SQL migrations (MigrationRunner runs these on first boot) ─────────────────
; API resolves migrations via FACTUM_IL_ROOT env var set to {app}\app\
; so FACTUM_IL_ROOT + '\migrations' = {app}\app\migrations\  ✓
Source: "FactumIL_Dist\migrations\*"; DestDir: "{app}\app\migrations"; Flags: ignoreversion

; ── Bundled legislation corpus (offline KB, loaded into SQLite on first boot) ──
; Loader reads FACTUM_IL_ROOT\legal-corpus\ = {app}\app\legal-corpus\. Large + generated
; by `pnpm ingest-knesset-odata`; skipifsourcedoesntexist so packaging works without it.
Source: "FactumIL_Dist\legal-corpus\*"; DestDir: "{app}\app\legal-corpus"; Flags: ignoreversion skipifsourcedoesntexist createallsubdirs recursesubdirs


; ── Legal Registry + PowerShell helpers ──────────────────────────────────────
Source: "FactumIL_Dist\powershell\lib\Legal_Registry.json";  DestDir: "{app}\powershell\lib"; Flags: ignoreversion
Source: "FactumIL_Dist\powershell\lib\Config.ps1";           DestDir: "{app}\powershell\lib"; Flags: ignoreversion skipifsourcedoesntexist
Source: "FactumIL_Dist\powershell\lib\IdentifierParser.ps1"; DestDir: "{app}\powershell\lib"; Flags: ignoreversion skipifsourcedoesntexist

; ── App icon ──────────────────────────────────────────────────────────────────
Source: "assets\logo\factum-il-icon.ico"; DestDir: "{app}\assets\logo"; Flags: ignoreversion

; ── Tools: Ollama + WebView2 bootstrapper + optional audio tools ─────────────
Source: "FactumIL_Dist\tools\OllamaSetup.exe";                   DestDir: "{app}\tools"; Flags: ignoreversion skipifsourcedoesntexist
Source: "FactumIL_Dist\tools\MicrosoftEdgeWebview2Setup.exe";     DestDir: "{app}\tools"; Flags: ignoreversion skipifsourcedoesntexist
Source: "FactumIL_Dist\tools\whisper-fast.exe";                   DestDir: "{app}\tools"; Flags: ignoreversion skipifsourcedoesntexist
Source: "FactumIL_Dist\tools\ffmpeg.exe";                         DestDir: "{app}\tools"; Flags: ignoreversion skipifsourcedoesntexist
Source: "FactumIL_Dist\tools\sqlite-vec.dll";                     DestDir: "{app}\tools"; Flags: ignoreversion skipifsourcedoesntexist
Source: "FactumIL_Dist\tools\register-ollama-model.ps1";          DestDir: "{app}\tools"; Flags: ignoreversion skipifsourcedoesntexist

; ── AI model GGUF (bundled — no internet required on first launch) ────────────
Source: "FactumIL_Dist\models\law-il-E2B-Q4_K_M.gguf"; DestDir: "{app}\models"; Flags: ignoreversion skipifsourcedoesntexist

[Icons]
; Start Menu
Name: "{group}\{#AppName}";      Filename: "{app}\{#AppExeName}"; IconFilename: "{app}\assets\logo\factum-il-icon.ico"; Tasks: startmenu
Name: "{group}\הסר התקנה";       Filename: "{uninstallexe}";                                                            Tasks: startmenu
; Desktop shortcut
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppExeName}"; IconFilename: "{app}\assets\logo\factum-il-icon.ico"; Tasks: desktopicon

[Registry]
; FACTUM_IL_ROOT — the app\ subdirectory so Node finds migrations and assets correctly
Root: HKLM; Subkey: "SYSTEM\CurrentControlSet\Control\Session Manager\Environment"; \
  ValueType: expandsz; ValueName: "FACTUM_IL_ROOT"; ValueData: "{app}\app"; \
  Flags: preservestringtype uninsdeletevalue

; Optional audio/speech tool paths forwarded to Node process
Root: HKLM; Subkey: "SYSTEM\CurrentControlSet\Control\Session Manager\Environment"; \
  ValueType: expandsz; ValueName: "WHISPER_EXE"; ValueData: "{app}\tools\whisper-fast.exe"; \
  Flags: preservestringtype uninsdeletevalue
Root: HKLM; Subkey: "SYSTEM\CurrentControlSet\Control\Session Manager\Environment"; \
  ValueType: expandsz; ValueName: "FFMPEG_EXE"; ValueData: "{app}\tools\ffmpeg.exe"; \
  Flags: preservestringtype uninsdeletevalue

; AI model — must always be the Israeli legal model, forwarded to Node process by ApiHostService
Root: HKLM; Subkey: "SYSTEM\CurrentControlSet\Control\Session Manager\Environment"; \
  ValueType: string; ValueName: "OLLAMA_MODEL"; ValueData: "BrainboxAI/law-il-E2B:Q4_K_M"; \
  Flags: preservestringtype uninsdeletevalue

; AI tier — standard by default (controls reasoning depth in model-router)
Root: HKLM; Subkey: "SYSTEM\CurrentControlSet\Control\Session Manager\Environment"; \
  ValueType: string; ValueName: "AI_TIER"; ValueData: "standard"; \
  Flags: preservestringtype uninsdeletevalue

; sqlite-vec native extension — enables migration 052 and fast KNN vector search
; Falls back to JS cosine similarity if the DLL is absent (skipifsourcedoesntexist on [Files])
Root: HKLM; Subkey: "SYSTEM\CurrentControlSet\Control\Session Manager\Environment"; \
  ValueType: expandsz; ValueName: "SQLITE_VEC_PATH"; ValueData: "{app}\tools\sqlite-vec.dll"; \
  Flags: preservestringtype uninsdeletevalue

; Ollama base URL — forwarded to Node process by ApiHostService
Root: HKLM; Subkey: "SYSTEM\CurrentControlSet\Control\Session Manager\Environment"; \
  ValueType: string; ValueName: "OLLAMA_BASE_URL"; ValueData: "http://127.0.0.1:11434"; \
  Flags: preservestringtype uninsdeletevalue

; Installed version — read by /api/updates/check to compare against remote manifest
Root: HKLM; Subkey: "SYSTEM\CurrentControlSet\Control\Session Manager\Environment"; \
  ValueType: string; ValueName: "FACTUM_IL_VERSION"; ValueData: "{#AppVersion}"; \
  Flags: preservestringtype uninsdeletevalue

; Legal documents directory chosen by the user in the wizard
Root: HKLM; Subkey: "SOFTWARE\Factum IL"; ValueType: string; ValueName: "OrgDirectory"; \
  ValueData: "{code:GetOrgDir}"; Flags: uninsdeletevalue

[Run]
; ── 1. Install WebView2 (silent, user-level, if not already present) ──────────
Filename: "{app}\tools\MicrosoftEdgeWebview2Setup.exe"; \
  Parameters: "/silent /install"; \
  StatusMsg: "מתקין WebView2 Runtime…"; \
  Flags: waituntilterminated skipifdoesntexist; \
  Check: NeedsWebView2

; ── 2. Install Ollama (silent, if not already installed) ─────────────────────
Filename: "{app}\tools\OllamaSetup.exe"; \
  Parameters: "/S"; \
  StatusMsg: "מתקין Ollama (מנוע AI)…"; \
  Flags: waituntilterminated skipifdoesntexist; \
  Check: NeedsOllama

; ── 3. Register bundled GGUF with Ollama (offline — no internet required) ─────
; Runs 'ollama create' against the on-disk GGUF so the model is immediately
; available when the app first launches. Non-fatal: the WPF OllamaService
; provides a first-run fallback if this step is skipped or fails.
Filename: "powershell.exe"; \
  Parameters: "-WindowStyle Hidden -NonInteractive -ExecutionPolicy Bypass -File ""{app}\tools\register-ollama-model.ps1"" -GgufPath ""{app}\models\law-il-E2B-Q4_K_M.gguf"""; \
  StatusMsg: "מאתחל מודל AI (ייתכן שייקח מספר דקות)…"; \
  Flags: waituntilterminated; \
  Check: FileExists(ExpandConstant('{app}\models\law-il-E2B-Q4_K_M.gguf')) and FileExists(ExpandConstant('{app}\tools\register-ollama-model.ps1'))

; ── 4. Launch app after install (the WPF shell handles everything else) ───────
Filename: "{app}\{#AppExeName}"; \
  Description: "הפעל את Factum IL עכשיו"; \
  Flags: nowait postinstall skipifsilent skipifdoesntexist

[InstallDelete]
; Purge stale compiled output and native bindings from any previous installation.
; Runs before [Files], so the fresh installer always wins with no leftover modules.
; Without this, removed npm packages and old .node ABI binaries stay in node_modules
; and cause MODULE_NOT_FOUND / native binding crashes on upgrade.
Type: filesandordirs; Name: "{app}\app\api\node_modules"
Type: filesandordirs; Name: "{app}\app\api\dist"
Type: filesandordirs; Name: "{app}\app\dashboard\dist"

[UninstallDelete]
; Remove runtime-generated files on uninstall (leaves %LOCALAPPDATA%\FactumIL intact)
Type: filesandordirs; Name: "{app}\app\api\node_modules\.cache"
Type: filesandordirs; Name: "{app}\logs"

[Code]
var
  OrgDirPage: TInputDirWizardPage;

// ── Read installed version from registry ─────────────────────────────────────
function InstalledVersionStr(): String;
var Ver: String;
begin
  if not RegQueryStringValue(HKLM,
    'SYSTEM\CurrentControlSet\Control\Session Manager\Environment',
    'FACTUM_IL_VERSION', Ver) then Ver := '';
  Result := Ver;
end;

// ── Parse one dot-separated segment (1=major, 2=minor, 3=patch) ──────────────
function ParseVersionPart(S: String; Part: Integer): Integer;
var I, DotCount: Integer; Seg: String;
begin
  DotCount := 0; Seg := ''; Result := 0;
  for I := 1 to Length(S) do
  begin
    if S[I] = '.' then
    begin
      Inc(DotCount);
      if DotCount = Part then begin Result := StrToIntDef(Seg, 0); Exit; end;
      Seg := '';
    end else
      Seg := Seg + S[I];
  end;
  if DotCount = Part - 1 then Result := StrToIntDef(Seg, 0);
end;

// ── Returns True when Existing > Installing (downgrade scenario) ──────────────
function IsNewerVersion(Existing, Installing: String): Boolean;
var EM, EMin, EP, IM, IMin, IP: Integer;
begin
  EM   := ParseVersionPart(Existing,   1);  IM   := ParseVersionPart(Installing, 1);
  EMin := ParseVersionPart(Existing,   2);  IMin := ParseVersionPart(Installing, 2);
  EP   := ParseVersionPart(Existing,   3);  IP   := ParseVersionPart(Installing, 3);
  Result := (EM > IM) or
            ((EM = IM) and (EMin > IMin)) or
            ((EM = IM) and (EMin = IMin) and (EP > IP));
end;

// ── Detect .NET 8 Desktop Runtime (required for WPF) ─────────────────────────
// WPF requires Microsoft.WindowsDesktop.App, not just Microsoft.NETCore.App.
// Checks three locations in order of reliability.
function IsDotNet8DesktopInstalled(): Boolean;
var
  SubKeys: TArrayOfString;
  I: Integer;
  DesktopDir: String;
  FindRec: TFindRec;
begin
  Result := False;

  // 1. Filesystem: %ProgramFiles%\dotnet\shared\Microsoft.WindowsDesktop.App\8.*
  DesktopDir := ExpandConstant('{pf}') + '\dotnet\shared\Microsoft.WindowsDesktop.App';
  if DirExists(DesktopDir) then
  begin
    if FindFirst(DesktopDir + '\8.*', FindRec) then
    begin
      FindClose(FindRec);
      Result := True;
      Exit;
    end;
  end;

  // 2. Registry (MSI installer path)
  if RegGetSubkeyNames(HKLM,
      'SOFTWARE\dotnet\Setup\InstalledVersions\x64\sharedfx\Microsoft.WindowsDesktop.App',
      SubKeys) then
  begin
    for I := 0 to GetArrayLength(SubKeys) - 1 do
      if Copy(SubKeys[I], 1, 2) = '8.' then begin Result := True; Exit; end;
  end;

  // 3. Fallback: check for winget/Store key mentioning windowsdesktop
  if RegGetSubkeyNames(HKLM,
      'SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall',
      SubKeys) then
  begin
    for I := 0 to GetArrayLength(SubKeys) - 1 do
      if Pos('windowsdesktop', LowerCase(SubKeys[I])) > 0 then
        begin Result := True; Exit; end;
  end;
end;

// ── Detect WebView2 (Evergreen) ───────────────────────────────────────────────
function NeedsWebView2(): Boolean;
var
  Ver: string;
begin
  // Check machine-wide key (Edge/WebView2 GUID)
  if RegQueryStringValue(HKLM,
    'SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}',
    'pv', Ver) then
  begin Result := (Ver = '') or (Ver = '0.0.0.0'); Exit; end;
  // Check user-level install (non-admin)
  if RegQueryStringValue(HKCU,
    'SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}',
    'pv', Ver) then
  begin Result := (Ver = '') or (Ver = '0.0.0.0'); Exit; end;
  Result := True;
end;

// ── Detect Ollama ─────────────────────────────────────────────────────────────
function NeedsOllama(): Boolean;
begin
  Result := not FileExists(ExpandConstant('{localappdata}\Programs\Ollama\ollama.exe'))
         and not FileExists(ExpandConstant('{pf}\Ollama\ollama.exe'));
end;

// ── Pre-wizard checks — abort early if .NET 8 Desktop Runtime is missing ──────
function InitializeSetup(): Boolean;
var
  ErrCode: Integer;
  ExistingVer: String;
begin
  Result := True;

  if not IsDotNet8DesktopInstalled() then
  begin
    if MsgBox(
      '.NET 8 Desktop Runtime נדרש ל-Factum IL ואינו מותקן.' + #13#10 +
      'זהו רכיב חינמי של Microsoft הנדרש להפעלת ממשק המשתמש.' + #13#10#13#10 +
      'לחץ כן לפתיחת דף ההורדה, ולאחר ההתקנה הפעל שוב את המתקין.' + #13#10 +
      '(חפש: ".NET 8.0 Desktop Runtime (v8.x.x) — Windows x64")',
      mbConfirmation, MB_YESNO) = IDYES then
    begin
      ShellExec('open',
        'https://dotnet.microsoft.com/en-us/download/dotnet/8.0',
        '', '', SW_SHOW, ewNoWait, ErrCode);
    end;
    MsgBox('התקן את .NET 8 Desktop Runtime ולאחר מכן הפעל שוב את המתקין.', mbInformation, MB_OK);
    Result := False;
    Exit;
  end;

  // ── Downgrade guard ────────────────────────────────────────────────────────
  ExistingVer := InstalledVersionStr();
  if (ExistingVer <> '') and IsNewerVersion(ExistingVer, '{#AppVersion}') then
  begin
    if MsgBox(
      'גרסה ' + ExistingVer + ' כבר מותקנת — חדשה מגרסה {#AppVersion} שברצונך להתקין.' + #13#10 +
      'התקנת גרסה ישנה יותר עלולה לגרום לבעיות.' + #13#10#13#10 +
      'האם להמשיך בכל זאת?',
      mbConfirmation, MB_YESNO) = IDNO then
    begin
      Result := False;
      Exit;
    end;
  end;
end;

// ── Legal Documents Directory wizard page ────────────────────────────────────
procedure InitializeWizard;
begin
  OrgDirPage := CreateInputDirPage(
    wpSelectDir,
    'תיקיית המסמכים המשפטיים',
    'בחר את תיקיית מסמכי המשרד הראשית',
    'Factum IL יארגן את כל המסמכים לתיקייה זו.' + #13#10 +
    'ניתן לשנות הגדרה זו בכל עת מהגדרות המערכת.',
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
