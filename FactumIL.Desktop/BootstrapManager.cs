using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace FactumIL.Desktop;

/// <summary>Severity of a single bootstrap step's result.</summary>
public enum StepOutcome
{
    /// <summary>Step completed successfully.</summary>
    Ok,
    /// <summary>Non-fatal: a dependency is unavailable but the app can run degraded
    /// (e.g. no internet + bundled model missing, corpus not present). Recorded but
    /// not marked complete so it is retried on the next launch.</summary>
    RecoverableOffline,
    /// <summary>Fatal: the app cannot function (e.g. missing FACTUM_IL_ROOT / node.exe,
    /// unhealthy database).</summary>
    Fatal,
    /// <summary>Already complete from a previous run — skipped on resume.</summary>
    Skipped,
}

/// <summary>Aggregate result of a full bootstrap pass.</summary>
public enum BootstrapOutcome { Success, Degraded, Fatal }

public sealed record BootstrapResult(
    BootstrapOutcome Outcome,
    List<string> Warnings,
    List<string> Errors);

/// <summary>Progress emitted while bootstrap runs (mapped to the splash UI by App).</summary>
public sealed record BootstrapProgress(int StepIndex, int StepCount, string StepName, int Percent, string Detail);

/// <summary>
/// Resumable first-launch bootstrap (Phase 6). All heavy initialization that used
/// to block the installer (model registration, verification) runs here instead, on
/// the first launch of the WPF shell. Progress is persisted to
/// <c>%LOCALAPPDATA%\FactumIL\bootstrap-state.json</c>; if a step fails or the app
/// is killed mid-way, the next launch <b>resumes at the first incomplete step</b>
/// rather than restarting from scratch.
///
/// The persisted state carries a <c>bootstrapVersion</c> (Enhancement 6): when a
/// new app version introduces new steps, previously completed steps stay complete
/// and only the new steps run. Each step is classified as
/// <see cref="StepOutcome.Ok"/>, <see cref="StepOutcome.RecoverableOffline"/> or
/// <see cref="StepOutcome.Fatal"/> (Enhancement 8 offline-first).
/// </summary>
public sealed class BootstrapManager
{
    /// <summary>Bump when adding/removing steps so upgrades re-run only new work.</summary>
    public const int CurrentVersion = 1;

    private static readonly string StatePath = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "FactumIL", "bootstrap-state.json");

    private readonly OllamaService _ollama;
    private readonly StartupLogger _logger;
    private readonly int _apiPort;

    private sealed record Step(string Id, string DisplayName, Func<IProgress<(int, string)>?, CancellationToken, Task<(StepOutcome Outcome, string Detail)>> Run);

    public BootstrapManager(OllamaService ollama, StartupLogger logger, int apiPort)
    {
        _ollama  = ollama;
        _logger  = logger;
        _apiPort = apiPort;
    }

    /// <summary>
    /// Runs (or resumes) the bootstrap. Reports progress, writes
    /// <c>bootstrap-summary.json</c>, and records field-failure analytics.
    /// Never throws.
    /// </summary>
    public async Task<BootstrapResult> RunAsync(
        IProgress<BootstrapProgress>? progress = null,
        CancellationToken ct = default)
    {
        var warnings = new List<string>();
        var errors   = new List<string>();
        var recoveryActions = new List<string>();

        var state = LoadState();
        state.AttemptCount += 1;

        var resuming = state.CompletedSteps.Count > 0;
        var overallStart = DateTime.UtcNow;
        _logger.Log("bootstrap", resuming ? "resume" : "start", LogStatus.Started,
            extra: new Dictionary<string, object?>
            {
                ["bootstrapVersion"] = state.BootstrapVersion,
                ["completed"]        = state.CompletedSteps.Count,
                ["attempt"]          = state.AttemptCount,
            });

        var steps   = BuildSteps();
        var outcome = BootstrapOutcome.Success;
        string? failedStep = null;

        for (var i = 0; i < steps.Count; i++)
        {
            var step = steps[i];
            if (ct.IsCancellationRequested) break;

            // ── Resume: skip steps already completed under the current version ──
            if (state.CompletedSteps.ContainsKey(step.Id))
            {
                _logger.Log("bootstrap", step.Id, LogStatus.Skipped);
                progress?.Report(new BootstrapProgress(i + 1, steps.Count, step.DisplayName, 100, "כבר הושלם ✓"));
                continue;
            }

            progress?.Report(new BootstrapProgress(i + 1, steps.Count, step.DisplayName, 0, step.DisplayName));
            var stepStart = DateTime.UtcNow;
            var stepProgress = new Progress<(int Percent, string Detail)>(p =>
                progress?.Report(new BootstrapProgress(i + 1, steps.Count, step.DisplayName, p.Percent, p.Detail)));

            StepOutcome stepOutcome;
            string stepDetail;
            try
            {
                (stepOutcome, stepDetail) = await step.Run(stepProgress, ct);
            }
            catch (Exception ex)
            {
                stepOutcome = StepOutcome.RecoverableOffline;
                stepDetail  = ex.Message;
            }

            var durationMs = (long)(DateTime.UtcNow - stepStart).TotalMilliseconds;

            switch (stepOutcome)
            {
                case StepOutcome.Ok:
                    state.CompletedSteps[step.Id] = DateTime.UtcNow.ToString("o");
                    SaveState(state);
                    _logger.Log("bootstrap", step.Id, LogStatus.Ok, durationMs, stepDetail);
                    break;

                case StepOutcome.RecoverableOffline:
                    warnings.Add($"{step.DisplayName}: {stepDetail}");
                    recoveryActions.Add($"retry:{step.Id}");
                    outcome = BootstrapOutcome.Degraded;
                    _logger.Log("bootstrap", step.Id, LogStatus.Warn, durationMs, stepDetail);
                    // not marked complete — retried on next launch
                    break;

                case StepOutcome.Fatal:
                    errors.Add($"{step.DisplayName}: {stepDetail}");
                    failedStep = step.Id;
                    outcome = BootstrapOutcome.Fatal;
                    _logger.Log("bootstrap", step.Id, LogStatus.Failed, durationMs, stepDetail);
                    break;

                case StepOutcome.Skipped:
                    _logger.Log("bootstrap", step.Id, LogStatus.Skipped, durationMs, stepDetail);
                    break;
            }

            if (outcome == BootstrapOutcome.Fatal) break;
        }

        // Upgrade the persisted version once a full pass has run.
        state.BootstrapVersion = CurrentVersion;
        state.LastError = errors.Count > 0 ? string.Join("; ", errors) : null;
        SaveState(state);

        var overallSeconds = (DateTime.UtcNow - overallStart).TotalSeconds;
        _logger.LogTiming("bootstrap", resuming ? "resume-duration" : "duration",
            (long)(overallSeconds * 1000),
            resuming ? StartupBudgets.BootstrapResume : StartupBudgets.AppLaunch);

        var nowIso = DateTime.UtcNow.ToString("o");
        var summary = new BootstrapSummary
        {
            BootstrapVersion = CurrentVersion,
            LastSuccessUtc   = outcome != BootstrapOutcome.Fatal ? nowIso : ReadPreviousSuccess(),
            LastFailureUtc   = outcome == BootstrapOutcome.Fatal ? nowIso : null,
            FailedStep       = failedStep,
            AttemptCount     = state.AttemptCount,
            DurationSeconds  = Math.Round(overallSeconds, 2),
            RecoveryActions  = recoveryActions,
        };
        _logger.WriteBootstrapSummary(summary);

        if (outcome != BootstrapOutcome.Success)
        {
            _logger.RecordFailureAnalytics(new FailureRecord
            {
                Category        = outcome == BootstrapOutcome.Fatal ? "bootstrap-fatal" : "bootstrap-degraded",
                Component       = failedStep ?? (warnings.Count > 0 ? "ai-stack" : "unknown"),
                RetryCount      = state.AttemptCount,
                RecoveryOutcome = outcome.ToString().ToLowerInvariant(),
            });
        }

        _logger.Log("bootstrap", "complete", outcome == BootstrapOutcome.Fatal ? LogStatus.Failed : LogStatus.Ok,
            error: outcome == BootstrapOutcome.Fatal ? state.LastError : null);

        return new BootstrapResult(outcome, warnings, errors);
    }

    // ── Step definitions ────────────────────────────────────────────────────────

    private List<Step> BuildSteps() =>
    [
        new("deps",          "בודק תלויות מערכת…",       (_, _)  => Task.FromResult(CheckDependencies())),
        new("webview2",      "בודק WebView2…",            (_, _)  => Task.FromResult(CheckWebView2())),
        new("ollama-runtime","מפעיל מנוע AI…",            RunOllamaRuntime),
        new("ollama-model",  "מאתחל מודל AI…",            RunOllamaModel),
        new("database",      "מאמת מסד נתונים…",          (_, ct) => VerifyDatabaseAsync(ct)),
        new("vector-index",  "מאמת אינדקס וקטורי…",       (_, ct) => VerifyFunctionalAsync("vector", ct)),
        new("corpus",        "מאמת מאגר משפטי…",          (_, ct) => VerifyFunctionalAsync("corpus", ct)),
    ];

    private (StepOutcome, string) CheckDependencies()
    {
        var root = Environment.GetEnvironmentVariable("FACTUM_IL_ROOT");
        if (string.IsNullOrWhiteSpace(root) || !Directory.Exists(root))
            return (StepOutcome.Fatal, "FACTUM_IL_ROOT לא מוגדר או לא קיים");

        var nodePath = Path.GetFullPath(Path.Combine(root, "..", "app", "node", "node.exe"));
        if (!File.Exists(nodePath))
            return (StepOutcome.Fatal, $"node.exe לא נמצא: {nodePath}");

        try
        {
            var drive = new DriveInfo(Path.GetPathRoot(root)!);
            var freeMb = drive.AvailableFreeSpace / (1024L * 1024L);
            if (freeMb < 200)
                return (StepOutcome.Fatal, $"שטח דיסק נמוך: {freeMb}MB");
        }
        catch { /* disk probe best-effort */ }

        return (StepOutcome.Ok, "תלויות תקינות");
    }

    private static (StepOutcome, string) CheckWebView2()
    {
        // Informational — MainWindow surfaces a clear installer prompt if missing.
        var installed = WebView2Installed();
        return installed
            ? (StepOutcome.Ok, "WebView2 מותקן")
            : (StepOutcome.RecoverableOffline, "WebView2 חסר — יותקן/ידרוש התקנה");
    }

    private async Task<(StepOutcome, string)> RunOllamaRuntime(IProgress<(int, string)>? progress, CancellationToken ct)
    {
        if (!OllamaService.IsOllamaInstalled())
            return (StepOutcome.RecoverableOffline, "Ollama אינו מותקן — מצב ללא AI");

        await _ollama.StartAsync();
        var ready = await RetryPolicy.RunAsync(
            _ => _ollama.PingPublicAsync(),
            new RetryOptions { Operation = "ollama-ready", MaxAttempts = 6, InitialDelay = TimeSpan.FromSeconds(1), MaxDelay = TimeSpan.FromSeconds(5), OverallTimeout = StartupBudgets.OllamaReady },
            log: msg => _logger.Log("bootstrap", "ollama-ready", LogStatus.Started, error: msg),
            ct: ct);

        return ready
            ? (StepOutcome.Ok, "מנוע AI פעיל")
            : (StepOutcome.RecoverableOffline, "מנוע AI לא הגיב — מצב ללא AI");
    }

    private async Task<(StepOutcome, string)> RunOllamaModel(IProgress<(int, string)>? progress, CancellationToken ct)
    {
        if (!OllamaService.IsOllamaInstalled() || !await _ollama.PingPublicAsync())
            return (StepOutcome.RecoverableOffline, "מנוע AI לא זמין — רישום מודל יידחה");

        var modelProgress = new Progress<(int Percent, string Status)>(t => progress?.Report((t.Percent, t.Status)));
        await _ollama.EnsureModelAsync(modelProgress);

        return _ollama.Lifecycle.Model == OllamaModelState.Ready
            ? (StepOutcome.Ok, "מודל AI רשום ומוכן")
            : (StepOutcome.RecoverableOffline, "רישום מודל לא הושלם — יבוצע בהפעלה הבאה");
    }

    private async Task<(StepOutcome, string)> VerifyDatabaseAsync(CancellationToken ct)
    {
        var health = await GetHealthAsync("/api/health", ct);
        if (health is null)
            return (StepOutcome.Fatal, "API לא הגיב לבדיקת מסד נתונים");

        var dbHealthy = TryReadCheck(health.Value, "db");
        return dbHealthy
            ? (StepOutcome.Ok, "מסד נתונים תקין")
            : (StepOutcome.Fatal, "מסד נתונים אינו תקין");
    }

    private async Task<(StepOutcome, string)> VerifyFunctionalAsync(string component, CancellationToken ct)
    {
        var result = await FunctionalHealthChecks.CheckApiFunctionalAsync(_apiPort, ct);
        // Vector index / corpus are non-fatal: the app degrades to FTS-only / no-corpus.
        return result.Healthy
            ? (StepOutcome.Ok, $"{component}: {result.Detail}")
            : (StepOutcome.RecoverableOffline, $"{component} מוגבל: {result.Detail}");
    }

    // ── Health helpers ──────────────────────────────────────────────────────────

    private async Task<JsonElement?> GetHealthAsync(string path, CancellationToken ct)
    {
        try
        {
            using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(5) };
            var res  = await http.GetAsync($"http://localhost:{_apiPort}{path}", ct);
            var body = await res.Content.ReadAsStringAsync(ct);
            using var doc = JsonDocument.Parse(body);
            return doc.RootElement.Clone();
        }
        catch { return null; }
    }

    private static bool TryReadCheck(JsonElement root, string name)
    {
        try
        {
            return root.TryGetProperty("checks", out var checks)
                && checks.TryGetProperty(name, out var check)
                && check.TryGetProperty("healthy", out var healthy)
                && healthy.ValueKind == JsonValueKind.True;
        }
        catch { return false; }
    }

    private static bool WebView2Installed()
    {
        // Mirrors the registry probe used by installer.iss NeedsWebView2().
        try
        {
            const string key = @"SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}";
            using var hklm = Microsoft.Win32.Registry.LocalMachine.OpenSubKey(key);
            var pv = hklm?.GetValue("pv") as string;
            if (!string.IsNullOrEmpty(pv) && pv != "0.0.0.0") return true;

            const string keyUser = @"SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}";
            using var hkcu = Microsoft.Win32.Registry.CurrentUser.OpenSubKey(keyUser);
            var pvu = hkcu?.GetValue("pv") as string;
            return !string.IsNullOrEmpty(pvu) && pvu != "0.0.0.0";
        }
        catch { return false; }
    }

    // ── State persistence ───────────────────────────────────────────────────────

    private static readonly JsonSerializerOptions _json = new()
    {
        WriteIndented = true,
        Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
    };

    private sealed class BootstrapState
    {
        public int BootstrapVersion { get; set; } = CurrentVersion;
        public Dictionary<string, string> CompletedSteps { get; set; } = new();
        public string? LastError { get; set; }
        public int AttemptCount { get; set; }
    }

    private static BootstrapState LoadState()
    {
        try
        {
            if (File.Exists(StatePath))
            {
                var json = File.ReadAllText(StatePath);
                var state = JsonSerializer.Deserialize<BootstrapState>(json, _json);
                if (state is not null) return state;
            }
        }
        catch { /* corrupt state — start clean */ }
        return new BootstrapState();
    }

    private static void SaveState(BootstrapState state)
    {
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(StatePath)!);
            File.WriteAllText(StatePath, JsonSerializer.Serialize(state, _json));
        }
        catch { /* best effort */ }
    }

    private string? ReadPreviousSuccess() => _logger.ReadBootstrapSummary()?.LastSuccessUtc;

    /// <summary>True once every step has been recorded complete under the current version.</summary>
    public static bool IsBootstrapComplete()
    {
        var state = LoadState();
        if (state.BootstrapVersion != CurrentVersion) return false;
        // The non-AI critical steps must be complete; AI steps may be deferred.
        return state.CompletedSteps.ContainsKey("deps")
            && state.CompletedSteps.ContainsKey("database");
    }
}
