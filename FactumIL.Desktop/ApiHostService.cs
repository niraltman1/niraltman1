using System.Diagnostics;
using System.IO;
using System.Windows;

namespace FactumIL.Desktop;

/// <summary>
/// Manages the lifecycle of the Node.js API server process.
/// Looks for node.exe in: bundled /app/node/node.exe → PATH.
/// </summary>
internal sealed class ApiHostService
{
    private Process? _process;

    private static string AppRoot =>
        Path.GetDirectoryName(Environment.ProcessPath ?? AppContext.BaseDirectory)!;

    private static string NodeExe
    {
        get
        {
            var bundled = Path.Combine(AppRoot, "app", "node", "node.exe");
            return File.Exists(bundled) ? bundled : "node.exe";
        }
    }

    private static string ApiEntry =>
        Path.Combine(AppRoot, "app", "api", "dist", "start.js");

    private static string DbPath =>
        Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "FactumIL", "factum-il.db");

    public void Start(bool safeMode = false)
    {
        if (!File.Exists(ApiEntry))
        {
            MessageBox.Show($"לא נמצא קובץ שרת:\n{ApiEntry}",
                            "Factum IL — שגיאה", MessageBoxButton.OK, MessageBoxImage.Error);
            Application.Current.Shutdown(1);
            return;
        }

        var userDataDir = Path.GetDirectoryName(DbPath)!;
        Directory.CreateDirectory(userDataDir);
        Directory.CreateDirectory(Path.Combine(AppRoot, "logs"));

        var psi = new ProcessStartInfo
        {
            FileName               = NodeExe,
            Arguments              = $"\"{ApiEntry}\"",
            WorkingDirectory       = Path.Combine(AppRoot, "app"),
            UseShellExecute        = false,
            CreateNoWindow         = true,
            RedirectStandardOutput = true,
            RedirectStandardError  = true,
        };

        psi.EnvironmentVariables["PORT"]                = "3001";
        psi.EnvironmentVariables["NODE_ENV"]            = "production";
        psi.EnvironmentVariables["FACTUM_IL_DB_PATH"]   = DbPath;
        // FACTUM_IL_ROOT points at the "app\" subdirectory so that the API
        // resolves migrations at {ROOT}/migrations = {app}\app\migrations,
        // which is where the installer stages the SQL files.
        psi.EnvironmentVariables["FACTUM_IL_ROOT"]      = Path.Combine(AppRoot, "app");
        psi.EnvironmentVariables["FACTUM_IL_DATA_PATH"] = userDataDir;

        // In recovery (safe) mode all background workers are disabled.
        if (safeMode)
            psi.EnvironmentVariables["FACTUM_IL_SAFE_MODE"] = "1";

        // Forward installer-set env vars if present
        foreach (var key in new[] { "OLLAMA_MODEL", "WHISPER_EXE", "FFMPEG_EXE",
                                    "BACKUP_ENCRYPT", "BACKUP_ENCRYPT_KEY", "AI_TIER" })
        {
            var val = Environment.GetEnvironmentVariable(key, EnvironmentVariableTarget.Machine);
            if (val is not null) psi.EnvironmentVariables[key] = val;
        }

        _process = new Process { StartInfo = psi };
        _process.OutputDataReceived += (_, e) => { if (e.Data is not null) LogLine(e.Data); };
        _process.ErrorDataReceived  += (_, e) => { if (e.Data is not null) LogLine("[ERR] " + e.Data); };
        _process.Start();
        _process.BeginOutputReadLine();
        _process.BeginErrorReadLine();
    }

    public void Stop()
    {
        try { _process?.Kill(entireProcessTree: true); }
        catch { /* best effort */ }
        _process = null;
    }

    public void Restart()
    {
        Stop();
        Start();
    }

    private static void LogLine(string line)
    {
        var logPath = Path.Combine(AppRoot, "logs", "api.log");
        Directory.CreateDirectory(Path.GetDirectoryName(logPath)!);
        File.AppendAllText(logPath, $"[{DateTime.Now:HH:mm:ss}] {line}{Environment.NewLine}");
    }
}
