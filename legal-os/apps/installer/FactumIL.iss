; Factum IL v13 -- Inno Setup 6 script
; Build via: .\powershell\scripts\Build-DistPackage.ps1
; Compiled by ISCC with /DRepoRoot=<path> /DOutputDir=<desktop-path>

#ifndef RepoRoot
  #define RepoRoot "..\.."
#endif
#ifndef OutputDir
  #define OutputDir "{#RepoRoot}\dist-package"
#endif

#define AppName    "Factum IL Beta"
#ifndef AppVersion
  #define AppVersion "1.0.0-beta"
#endif
#define AppPublisher "Factum IL"
#define AppURL     "https://github.com/niraltman1/Management-of-legal-documents-and-cases-"
#define ExeName    "FactumIL.Desktop.exe"

[Setup]
AppId={{A1B2C3D4-E5F6-7890-ABCD-EF1234567890}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
AppPublisherURL={#AppURL}
DefaultDirName={autopf}\{#AppName}
DefaultGroupName={#AppName}
AllowNoIcons=yes
DisableDirPage=no
OutputDir={#OutputDir}
OutputBaseFilename=FactumIL_Beta_Setup
SetupIconFile={#RepoRoot}\assets\logo\factum-il-icon.ico
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
ArchitecturesInstallIn64BitMode=x64
MinVersion=10.0.17763
UninstallDisplayIcon={app}\{#ExeName}
CloseApplications=yes

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "צור קיצור דרך על שולחן העבודה"; GroupDescription: "קיצורי דרך:"; Flags: checkedonce

[Files]
; Desktop shell
Source: "{#RepoRoot}\dist\win-x64\shell\{#ExeName}"; DestDir: "{app}"; Flags: ignoreversion skipifsourcedoesntexist

; Node.js API bundle
Source: "{#RepoRoot}\dist\win-x64\api\*"; DestDir: "{app}\api"; \
    Flags: ignoreversion recursesubdirs createallsubdirs skipifsourcedoesntexist

; Native node_modules (better-sqlite3 etc.)
Source: "{#RepoRoot}\dist\win-x64\node_modules\*"; DestDir: "{app}\node_modules"; \
    Flags: ignoreversion recursesubdirs createallsubdirs skipifsourcedoesntexist

; PowerShell installer/repair helper
Source: "{#RepoRoot}\apps\installer\START-HERE.ps1"; DestDir: "{app}"; Flags: ignoreversion skipifsourcedoesntexist

[Icons]
Name: "{group}\{#AppName}";         Filename: "{app}\{#ExeName}"
Name: "{group}\הסר התקנה";          Filename: "{uninstallexe}"
Name: "{autodesktop}\{#AppName}";   Filename: "{app}\{#ExeName}"; Tasks: desktopicon

[Registry]
; Persist the org directory so Factum IL API can read it on first launch
Root: HKLM; Subkey: "SOFTWARE\Factum IL"; ValueType: string; ValueName: "OrgDirectory"; \
    ValueData: "{code:GetOrgDir}"; Flags: uninsdeletevalue

[Run]
Filename: "{app}\{#ExeName}"; \
    Description: "הפעל את {#AppName}"; \
    Flags: nowait postinstall skipifsilent skipifdoesntexist

[Code]
// ── Custom wizard page — Legal Documents Organisation Directory ───────────
var
  OrgDirPage: TInputDirWizardPage;

procedure InitializeWizard;
begin
  OrgDirPage := CreateInputDirPage(
    wpSelectDir,
    'Legal Documents Directory',
    'Select the main legal documents folder for this firm',
    'Factum IL will organise all documents into this directory.' + #13#10 +
    'You can change this later from System Settings.',
    False,
    ''
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

// ── .NET 8 Runtime prerequisite check ────────────────────────────────────
// Checks three locations in order of reliability:
//   1. File-system: %ProgramFiles%\dotnet\shared\Microsoft.NETCore.App\8.*
//   2. Registry MSI key (classic installer)
//   3. Registry winget/standalone key (modern installer)
function IsDotNet8Installed(): Boolean;
var
  SubKeys: TArrayOfString;
  I: Integer;
  DotNetDir: String;
begin
  Result := False;

  // 1. File-system check (works for winget + standalone + MSI installs)
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
    // Fallback: if the shared folder itself exists, trust dotnet --list-runtimes
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

function InitializeSetup(): Boolean;
var
  ErrCode: Integer;
begin
  Result := True;
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
