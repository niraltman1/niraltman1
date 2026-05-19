; ============================================================================
;  Factum IL V13 — Inno Setup 6 Production Installer
;  Prerequisites: .\apps\desktop\publish.ps1  (populates FactumIL_Dist\)
;  Compile:       ISCC.exe installer.iss
;  Output:        dist-package\FactumIL_V13_Installer.exe
; ============================================================================

#define AppName      "Factum IL"
#define AppVersion   "13.0"
#define AppPublisher "Altman Law Firm"
#define AppURL       "https://altman-law.co.il"
#define AppExeName   "shell\FactumIL.Desktop.exe"
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
OutputBaseFilename=FactumIL_V13_Installer
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
WelcomeLabel2=מערכת הפעלה משפטית לצרכי משרד עורכי דין אלטמן.%n%nגרסה 13.0%n%nלחצו הבא להמשך.

[Tasks]
Name: "desktopicon"; Description: "צור קיצור דרך בשולחן העבודה"; GroupDescription: "קיצורי דרך:"; Flags: checkedonce

[Files]
; ── C# WPF shell (FactumIL.Desktop.exe + WebView2 DLLs — requires .NET 8) ───
Source: "FactumIL_Dist\shell\*";                             DestDir: "{app}\shell";           Flags: ignoreversion recursesubdirs

; ── Node.js API bundle (production node_modules, no pnpm symlinks) ───────────
Source: "FactumIL_Dist\backend\*";                           DestDir: "{app}\backend";         Flags: ignoreversion recursesubdirs

; ── React dashboard static assets (served by Express at /) ───────────────────
Source: "FactumIL_Dist\dashboard\*";                         DestDir: "{app}\dashboard";       Flags: ignoreversion recursesubdirs

; ── SQL migrations (run once on first boot via MigrationRunner) ───────────────
Source: "FactumIL_Dist\migrations\*";                        DestDir: "{app}\migrations";      Flags: ignoreversion

; ── Portable Node.js runtime (sovereign offline execution) ───────────────────
Source: "FactumIL_Dist\runtime\node.exe";                    DestDir: "{app}\runtime";         Flags: ignoreversion

; ── Legal Registry — offline normative knowledge base (ready-to-run) ─────────
Source: "FactumIL_Dist\powershell\lib\Legal_Registry.json";  DestDir: "{app}\powershell\lib";  Flags: ignoreversion
Source: "FactumIL_Dist\powershell\lib\Config.ps1";           DestDir: "{app}\powershell\lib";  Flags: ignoreversion skipifsourcedoesntexist
Source: "FactumIL_Dist\powershell\lib\IdentifierParser.ps1"; DestDir: "{app}\powershell\lib";  Flags: ignoreversion skipifsourcedoesntexist

; ── PowerShell scripts (START-HERE.ps1 + office automation helpers) ──────────
Source: "FactumIL_Dist\scripts\*";                           DestDir: "{app}\scripts";         Flags: ignoreversion recursesubdirs

; ── Optional bundled tools (graceful degradation if absent) ──────────────────
Source: "dist-package\tools\whisper-fast.exe";               DestDir: "{app}\tools";           Flags: ignoreversion skipifsourcedoesntexist
Source: "dist-package\tools\ffmpeg.exe";                     DestDir: "{app}\tools";           Flags: ignoreversion skipifsourcedoesntexist
Source: "dist-package\tools\OllamaSetup.exe";                DestDir: "{app}\tools";           Flags: ignoreversion skipifsourcedoesntexist

; ── App icon ──────────────────────────────────────────────────────────────────
Source: "assets\logo\factum-il-icon.ico";                    DestDir: "{app}\assets\logo";     Flags: ignoreversion

[Icons]
Name: "{group}\{#AppName}";       Filename: "{app}\{#AppExeName}"; IconFilename: "{app}\assets\logo\factum-il-icon.ico"
Name: "{group}\הסר התקנה";        Filename: "{uninstallexe}"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppExeName}"; IconFilename: "{app}\assets\logo\factum-il-icon.ico"; Tasks: desktopicon

[Registry]
; ── Set FACTUM_IL_ROOT so the API + PowerShell scripts find assets at runtime ─
Root: HKLM; Subkey: "SYSTEM\CurrentControlSet\Control\Session Manager\Environment"; \
  ValueType: expandsz; ValueName: "FACTUM_IL_ROOT"; ValueData: "{app}"; \
  Flags: preservestringtype uninsdeletevalue
Root: HKLM; Subkey: "SYSTEM\CurrentControlSet\Control\Session Manager\Environment"; \
  ValueType: expandsz; ValueName: "WHISPER_EXE";    ValueData: "{app}\tools\whisper-fast.exe"; \
  Flags: preservestringtype uninsdeletevalue
Root: HKLM; Subkey: "SYSTEM\CurrentControlSet\Control\Session Manager\Environment"; \
  ValueType: expandsz; ValueName: "FFMPEG_EXE";     ValueData: "{app}\tools\ffmpeg.exe"; \
  Flags: preservestringtype uninsdeletevalue
; ── Persist the legal documents directory chosen by the user ──────────────────
Root: HKLM; Subkey: "SOFTWARE\Factum IL"; ValueType: string; ValueName: "OrgDirectory"; \
  ValueData: "{code:GetOrgDir}"; Flags: uninsdeletevalue

[Run]
; ── 1. Install Ollama if missing ──────────────────────────────────────────────
Filename: "{app}\tools\OllamaSetup.exe"; \
  Parameters: "/S"; \
  StatusMsg: "מתקין Ollama…"; \
  Flags: waituntilterminated; Check: NeedsOllama

; ── 2. Post-install bootstrap: hardware check + AI model setup ───────────────
Filename: "powershell.exe"; \
  Parameters: "-ExecutionPolicy Bypass -NonInteractive -File ""{app}\scripts\START-HERE.ps1"" -Mode Installer -Silent"; \
  StatusMsg: "מגדיר מנוע AI ומכין את המערכת…"; \
  Flags: runhidden waituntilterminated

; ── 3. Launch app after install (optional) ───────────────────────────────────
Filename: "{app}\{#AppExeName}"; \
  Description: "הפעל את Factum IL עכשיו"; \
  Flags: nowait postinstall skipifsilent skipifdoesntexist

[UninstallDelete]
Type: filesandordirs; Name: "{app}\data"
Type: filesandordirs; Name: "{app}\logs"
Type: filesandordirs; Name: "{app}\_evidence"

[Code]
// ── Variables ────────────────────────────────────────────────────────────────
var
  OrgDirPage: TInputDirWizardPage;

// ── .NET 8 check (triple-source: filesystem, registry MSI, registry winget) ──
function IsDotNet8Installed(): Boolean;
var
  SubKeys: TArrayOfString;
  I: Integer;
  DotNetDir: String;
begin
  Result := False;

  // 1. Filesystem (works for winget + standalone + MSI installs)
  DotNetDir := ExpandConstant('{pf}') + '\dotnet\shared\Microsoft.NETCore.App';
  if DirExists(DotNetDir) then
  begin
    if RegGetSubkeyNames(HKLM,
        'SOFTWARE\dotnet\Setup\InstalledVersions\x64\sharedfx\Microsoft.NETCore.App',
        SubKeys) then
    begin
      for I := 0 to GetArrayLength(SubKeys) - 1 do
        if Copy(SubKeys[I], 1, 2) = '8.' then begin Result := True; Exit; end;
    end;
    if FindFirst(DotNetDir + '\8.*', faDirectory) <> 0 then
    begin Result := True; Exit; end;
  end;

  // 2. Registry MSI key
  if RegGetSubkeyNames(HKLM,
      'SOFTWARE\dotnet\Setup\InstalledVersions\x64\sharedfx\Microsoft.NETCore.App',
      SubKeys) then
  begin
    for I := 0 to GetArrayLength(SubKeys) - 1 do
      if Copy(SubKeys[I], 1, 2) = '8.' then begin Result := True; Exit; end;
  end;

  // 3. Registry winget / Microsoft Store key
  if RegGetSubkeyNames(HKLM,
      'SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall',
      SubKeys) then
  begin
    for I := 0 to GetArrayLength(SubKeys) - 1 do
      if Pos('dotnet', LowerCase(SubKeys[I])) > 0 then begin Result := True; Exit; end;
  end;
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
  Result := not RegQueryStringValue(HKLM,
    'SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}',
    'pv', Ver);
end;

// ── Pre-wizard checks — abort before any UI if prerequisites missing ──────────
function InitializeSetup(): Boolean;
var
  ErrCode: Integer;
begin
  Result := True;

  if NeedsWebView2 then
  begin
    if MsgBox('WebView2 Runtime נדרש ל-Factum IL.' + #13#10 +
              'לחץ כן להורדה אוטומטית, לא לביטול.',
              mbConfirmation, MB_YESNO) = IDYES then
      ShellExec('open',
        'https://go.microsoft.com/fwlink/p/?LinkId=2124703',
        '', '', SW_SHOWNORMAL, ewNoWait, ErrCode);
    MsgBox('התקן את WebView2 ולאחר מכן הפעל שוב את המתקין.', mbInformation, MB_OK);
    Result := False;
    Exit;
  end;

  if not IsDotNet8Installed() then
  begin
    if MsgBox(
      '.NET 8 Runtime is required but was not detected.' + #13#10 +
      'Download it now from microsoft.com?' + #13#10#13#10 +
      'Click Yes to open the download page, then re-run this installer.',
      mbConfirmation, MB_YESNO) = IDYES then
    begin
      ShellExec('open',
        'https://dotnet.microsoft.com/en-us/download/dotnet/8.0',
        '', '', SW_SHOW, ewNoWait, ErrCode);
    end;
    Result := False;
  end;
end;

// ── Wizard setup: Legal Documents Directory page ──────────────────────────────
procedure InitializeWizard;
begin
  OrgDirPage := CreateInputDirPage(
    wpSelectDir,
    'Legal Documents Directory',
    'Select the main legal documents folder for this firm',
    'Factum IL will organise all documents into this directory.' + #13#10 +
    'You can change this later from System Settings.',
    False, ''
  );
  OrgDirPage.Add('');
  OrgDirPage.Values[0] := 'C:\2026 Factum IL Documents';
end;

function GetOrgDir(Param: String): String;
begin
  Result := OrgDirPage.Values[0];
  if Result = '' then
    Result := 'C:\2026 Factum IL Documents';
end;
