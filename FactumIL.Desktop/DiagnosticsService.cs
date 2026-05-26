using System.IO;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace FactumIL.Desktop;

/// <summary>
/// Captures diagnostic data from the desktop shell: startup snapshots, crash reports,
/// and support bundle requests.  All methods are non-throwing.
/// </summary>
internal sealed class DiagnosticsService
{
    private static readonly string DiagDir = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "FactumIL", "diagnostics");

    private static readonly string CrashDir  = Path.Combine(DiagDir, "crashes");
    private static readonly string BundleDir = Path.Combine(DiagDir, "bundles");

    private static readonly string DataPath =
        Environment.GetEnvironmentVariable("FACTUM_IL_DATA_PATH")
        ?? Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "FactumIL");

    // ── Redaction patterns ────────────────────────────────────────────────────

    // Matches file paths that contain the FactumIL data directory segment
    private static readonly Regex PathPattern =
        new(@"[A-Za-z]:\\[^\s""'<>|?*\r\n]*FactumIL[^\s""'<>|?*\r\n]*",
            RegexOptions.IgnoreCase | RegexOptions.Compiled);

    // Israeli 9-digit ID (ת.ז.)
    private static readonly Regex IsraeliIdPattern =
        new(@"\b\d{9}\b", RegexOptions.Compiled);

    // Email addresses
    private static readonly Regex EmailPattern =
        new(@"\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b",
            RegexOptions.IgnoreCase | RegexOptions.Compiled);

    // ── Public API ────────────────────────────────────────────────────────────

    /// <summary>
    /// Records a startup diagnostic snapshot to <c>diagnostics/startup-{date}.json</c>.
    /// </summary>
    public async Task RecordStartupDiagnosticAsync(
        StartupValidator.ValidationResult validation)
    {
        try
        {
            Directory.CreateDirectory(DiagDir);
            var timestamp = DateTime.UtcNow.ToString("yyyy-MM-ddTHH-mm-ss");
            var filePath  = Path.Combine(DiagDir, $"startup-{timestamp}.json");

            var snapshot = new
            {
                id          = Guid.NewGuid().ToString(),
                recordedAt  = DateTime.UtcNow.ToString("o"),
                source      = "desktop",
                isHealthy   = validation.IsHealthy,
                canContinue = validation.CanContinue,
                errors      = validation.Errors,
                warnings    = validation.Warnings,
                env = new
                {
                    factumRoot     = Redact(Environment.GetEnvironmentVariable("FACTUM_IL_ROOT") ?? ""),
                    factumDataPath = Redact(Environment.GetEnvironmentVariable("FACTUM_IL_DATA_PATH") ?? ""),
                    nodeEnv        = Environment.GetEnvironmentVariable("NODE_ENV") ?? "",
                    ollamaModel    = Environment.GetEnvironmentVariable("OLLAMA_MODEL") ?? OllamaService.RequiredModel,
                },
            };

            await File.WriteAllTextAsync(filePath,
                JsonSerializer.Serialize(snapshot, new JsonSerializerOptions { WriteIndented = true }));
        }
        catch { /* non-throwing */ }
    }

    /// <summary>
    /// Captures an unhandled exception as a crash report JSON file.
    /// Redacts sensitive data before writing.
    /// </summary>
    public async Task RecordCrashAsync(Exception ex, string source)
    {
        try
        {
            Directory.CreateDirectory(CrashDir);
            var timestamp = DateTime.UtcNow.ToString("yyyy-MM-ddTHH-mm-ss-fff");
            var filePath  = Path.Combine(CrashDir, $"crash-{timestamp}.json");

            var report = new
            {
                id          = Guid.NewGuid().ToString(),
                occurredAt  = DateTime.UtcNow.ToString("o"),
                source      = "desktop",
                origin      = source,
                errorType   = ex.GetType().FullName ?? ex.GetType().Name,
                message     = Redact(ex.Message),
                stack       = Redact(ex.StackTrace ?? "(no stack trace)"),
            };

            await File.WriteAllTextAsync(filePath,
                JsonSerializer.Serialize(report, new JsonSerializerOptions { WriteIndented = true }));
        }
        catch { /* non-throwing */ }
    }

    /// <summary>
    /// Returns summaries of the most recent crash report files (last <paramref name="maxCount"/> files).
    /// </summary>
    public async Task<List<string>> GetRecentCrashSummariesAsync(int maxCount = 10)
    {
        var summaries = new List<string>();
        try
        {
            if (!Directory.Exists(CrashDir)) return summaries;

            var files = Directory.GetFiles(CrashDir, "crash-*.json")
                .OrderByDescending(f => f)
                .Take(maxCount);

            foreach (var file in files)
            {
                try
                {
                    var content = await File.ReadAllTextAsync(file);
                    summaries.Add(content);
                }
                catch { /* skip unreadable file */ }
            }
        }
        catch { /* non-throwing */ }
        return summaries;
    }

    /// <summary>
    /// Writes a support-bundle request trigger file that the Node.js API polling loop
    /// will detect and process.
    /// </summary>
    public async Task RequestSupportBundleAsync()
    {
        try
        {
            var requestPath = Path.Combine(DataPath, "support-bundle-request.json");
            var request = new
            {
                requestedAt = DateTime.UtcNow.ToString("o"),
                requestedBy = "desktop-shell",
                id          = Guid.NewGuid().ToString(),
            };
            await File.WriteAllTextAsync(requestPath,
                JsonSerializer.Serialize(request, new JsonSerializerOptions { WriteIndented = true }));
        }
        catch { /* non-throwing */ }
    }

    /// <summary>
    /// Installs global crash handlers.  Call once from <c>App.xaml.cs</c> early in
    /// <c>OnStartup()</c>.
    /// </summary>
    public static void InstallGlobalHandlers(DiagnosticsService service)
    {
        AppDomain.CurrentDomain.UnhandledException += (_, args) =>
        {
            var ex = args.ExceptionObject as Exception
                     ?? new Exception(args.ExceptionObject?.ToString() ?? "UnknownException");
            // Fire-and-forget: we're in a crash path and must not block.
            _ = service.RecordCrashAsync(ex, "AppDomain.UnhandledException");
        };

        TaskScheduler.UnobservedTaskException += (_, args) =>
        {
            args.SetObserved(); // prevent process termination
            _ = service.RecordCrashAsync(args.Exception, "TaskScheduler.UnobservedTaskException");
        };
    }

    // ── Redaction ─────────────────────────────────────────────────────────────

    private static string Redact(string input)
    {
        if (string.IsNullOrEmpty(input)) return input;
        var s = PathPattern.Replace(input, "[PATH]");
        s = EmailPattern.Replace(s, "[EMAIL]");
        s = IsraeliIdPattern.Replace(s, "[ID]");
        return s;
    }
}
