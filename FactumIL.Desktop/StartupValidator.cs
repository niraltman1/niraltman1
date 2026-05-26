using System.IO;
using System.Net.Http;
using System.Text.Json;

namespace FactumIL.Desktop;

/// <summary>
/// Validates system state before the main window is shown.
/// All checks are non-throwing — failures surface as Errors or Warnings.
/// </summary>
internal sealed class StartupValidator
{
    public record ValidationResult(
        bool IsHealthy,
        List<string> Warnings,
        List<string> Errors,
        bool CanContinue);

    private static readonly string LogFile = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "FactumIL", "logs", "startup.log");

    // ── Public API ────────────────────────────────────────────────────────────

    /// <summary>
    /// Runs all startup checks and returns a <see cref="ValidationResult"/>.
    /// Never throws.
    /// </summary>
    public async Task<ValidationResult> ValidateAsync()
    {
        var warnings = new List<string>();
        var errors   = new List<string>();

        Log("=== StartupValidator begin ===");

        // 1. FACTUM_IL_ROOT env var
        CheckFactumRoot(warnings, errors);

        // 2. Database file (first-run is OK)
        CheckDatabase(warnings, errors);

        // 3. node.exe reachable
        CheckNodeExe(warnings, errors);

        // 4. API health endpoint
        await CheckApiHealthAsync(warnings, errors);

        // 5. Ollama reachable
        bool ollamaReachable = await CheckOllamaAsync(warnings, errors);

        // 6. Model registered (only if Ollama is reachable)
        if (ollamaReachable)
            await CheckModelRegisteredAsync(warnings, errors);

        // 7. Disk space
        CheckDiskSpace(warnings, errors);

        bool isHealthy   = errors.Count == 0;
        // CanContinue = no fatal errors (we treat all current errors as non-fatal
        // so the user can choose to continue from RecoveryWindow).
        bool canContinue = true;

        Log($"IsHealthy={isHealthy}  CanContinue={canContinue}  " +
            $"Errors={errors.Count}  Warnings={warnings.Count}");
        foreach (var e in errors)   Log($"  ERROR   {e}");
        foreach (var w in warnings) Log($"  WARN    {w}");
        Log("=== StartupValidator end ===");

        return new ValidationResult(isHealthy, warnings, errors, canContinue);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    public static bool IsFirstRun() => !File.Exists(GetDbPath());

    public static string GetDbPath() =>
        Environment.GetEnvironmentVariable("FACTUM_IL_DB_PATH")
        ?? Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "FactumIL", "factum-il.db");

    // ── Individual checks ─────────────────────────────────────────────────────

    private static void CheckFactumRoot(List<string> warnings, List<string> errors)
    {
        try
        {
            var root = Environment.GetEnvironmentVariable("FACTUM_IL_ROOT");
            if (string.IsNullOrWhiteSpace(root))
            {
                errors.Add("משתנה סביבה FACTUM_IL_ROOT אינו מוגדר.");
                return;
            }
            if (!Directory.Exists(root))
                errors.Add($"תיקיית FACTUM_IL_ROOT אינה קיימת: {root}");
        }
        catch (Exception ex)
        {
            warnings.Add($"בדיקת FACTUM_IL_ROOT נכשלה: {ex.Message}");
        }
    }

    private static void CheckDatabase(List<string> warnings, List<string> errors)
    {
        try
        {
            var dbPath = GetDbPath();
            if (!File.Exists(dbPath))
            {
                if (IsFirstRun())
                    warnings.Add("הרצה ראשונה — מסד הנתונים ייצור אוטומטית.");
                else
                    errors.Add($"קובץ מסד הנתונים לא נמצא: {dbPath}");
            }
        }
        catch (Exception ex)
        {
            warnings.Add($"בדיקת מסד הנתונים נכשלה: {ex.Message}");
        }
    }

    private static void CheckNodeExe(List<string> warnings, List<string> errors)
    {
        try
        {
            var root = Environment.GetEnvironmentVariable("FACTUM_IL_ROOT");
            if (string.IsNullOrWhiteSpace(root)) return; // Already reported above

            var nodePath = Path.GetFullPath(
                Path.Combine(root, "..", "app", "node", "node.exe"));

            if (!File.Exists(nodePath))
                errors.Add($"node.exe לא נמצא ב-{nodePath}");
        }
        catch (Exception ex)
        {
            warnings.Add($"בדיקת node.exe נכשלה: {ex.Message}");
        }
    }

    private static async Task CheckApiHealthAsync(List<string> warnings, List<string> errors)
    {
        try
        {
            using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(3) };
            var res = await http.GetAsync("http://localhost:3001/api/health");
            if (!res.IsSuccessStatusCode)
                errors.Add($"ה-API השיב עם קוד שגיאה: {(int)res.StatusCode}");
        }
        catch (TaskCanceledException)
        {
            errors.Add("ה-API לא הגיב תוך 3 שניות (timeout).");
        }
        catch (HttpRequestException ex)
        {
            errors.Add($"ה-API אינו נגיש: {ex.Message}");
        }
        catch (Exception ex)
        {
            warnings.Add($"בדיקת API health נכשלה: {ex.Message}");
        }
    }

    private static async Task<bool> CheckOllamaAsync(List<string> warnings, List<string> errors)
    {
        try
        {
            using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(3) };
            var res = await http.GetAsync("http://localhost:11434/api/tags");
            if (res.IsSuccessStatusCode) return true;
            warnings.Add($"Ollama השיב עם קוד: {(int)res.StatusCode}");
            return false;
        }
        catch (TaskCanceledException)
        {
            warnings.Add("Ollama לא הגיב תוך 3 שניות — תכונות AI לא יהיו זמינות.");
            return false;
        }
        catch (HttpRequestException)
        {
            warnings.Add("Ollama אינו פועל — תכונות AI לא יהיו זמינות.");
            return false;
        }
        catch (Exception ex)
        {
            warnings.Add($"בדיקת Ollama נכשלה: {ex.Message}");
            return false;
        }
    }

    private static async Task CheckModelRegisteredAsync(List<string> warnings, List<string> errors)
    {
        try
        {
            using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(3) };
            var json = await http.GetStringAsync("http://localhost:11434/api/tags");
            if (!json.Contains(OllamaService.RequiredModel, StringComparison.OrdinalIgnoreCase))
                warnings.Add($"מודל ה-AI '{OllamaService.RequiredModel}' אינו רשום ב-Ollama.");
        }
        catch (Exception ex)
        {
            warnings.Add($"בדיקת מודל AI נכשלה: {ex.Message}");
        }
    }

    private static void CheckDiskSpace(List<string> warnings, List<string> errors)
    {
        try
        {
            var root = Environment.GetEnvironmentVariable("FACTUM_IL_ROOT");
            var path = string.IsNullOrWhiteSpace(root)
                ? Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData)
                : root;

            // Resolve to drive root
            var drive = new DriveInfo(Path.GetPathRoot(path)!);
            var freeMb = drive.AvailableFreeSpace / (1024L * 1024L);
            if (freeMb < 200)
                errors.Add($"שטח דיסק פנוי נמוך מדי: {freeMb} MB (נדרש לפחות 200 MB).");
        }
        catch (Exception ex)
        {
            warnings.Add($"בדיקת מקום בדיסק נכשלה: {ex.Message}");
        }
    }

    // ── Logging ───────────────────────────────────────────────────────────────

    private static void Log(string message)
    {
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(LogFile)!);
            File.AppendAllText(LogFile,
                $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] {message}{Environment.NewLine}");
        }
        catch { /* cannot log — swallow silently */ }
    }
}
