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

/// <summary>Outcome of one step run: severity, human detail, and retry count (R9).</summary>
public readonly record struct StepResult(StepOutcome Outcome, string Detail, int RetryCount = 0);

/// <summary>Progress emitted while bootstrap runs (mapped to the splash UI by App).</summary>
public sealed record BootstrapProgress(int StepIndex, int StepCount, string StepName, int Percent, string Detail);

/// <summary>
/// Resumable first-launch bootstrap. All heavy initialization that used to block the
/// installer (model registration, verification) runs here instead, on first launch
/// of the WPF shell. Progress is persisted (atomically, R2) to
/// <c>%LOCALAPPDATA%\FactumIL\bootstrap-state.json</c> keyed by <b>stable numeric
/// step IDs</b> (R3); if a step fails or the app is killed, the next launch
/// <b>resumes at the first incomplete step</b>. A named mutex (R7) guarantees only
/// one bootstrap runs at a time. On the first recoverable AI-infra failure the app
/// enters Safe Mode immediately (R8). Per-step telemetry feeds
/// <c>bootstrap-summary.json</c> (R9). Runtime/model state is owned by
/// <see cref="OllamaLifecycle"/> (R1).
/// </summary>
public sealed class BootstrapManager
{
    /// <summary>Bump when adding/removing steps so upgrades re-run only new work.</summary>
    public const int CurrentVersion = 1;

    private const string MutexName = @"Global\FactumIL.Bootstrap";

    private static readonly string StatePath = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "FactumIL", "bootstrap-state.json");

    private readonly OllamaService _ollama;
    private readonly StartupLogger _logger;
    private readonly int _apiPort;

    // Stable numeric step IDs (R3) — never change once shipped.
    private const int IdDeps = 10, IdWebView2 = 20, IdOllamaRuntime = 30, IdOllamaModel = 40,
                      IdDatabase = 50, IdVectorIndex = 60, IdCorpus = 70;

    private sealed record Step(
        int Id,
        string Name,
        string DisplayName,
        Func<IProgress<(int, string)>?, CancellationToken, Task<StepResult>> Run);

    public BootstrapManager(OllamaService ollama, StartupLogger logger, int apiPort)
    {
        _ollama  = ollama;
        _logger  = logger;
        _apiPort = apiPort;
    }

    /// <summary>
    /// Runs (or resumes) the bootstrap. Reports progress, writes
    /// <c>bootstrap-summary.json</c>. Never throws.
    /// </summary>
    public async Task<BootstrapResult> RunAsync(
        IProgress<BootstrapProgress>? progress = null,
        CancellationToken ct = default)
    {
        // ── Concurrency guard (R7): only one bootstrap at a time across processes ──
        Mutex? mutex = null;
        var owned = false;
        try
        {
            try { mutex = new Mutex(false, MutexName); }
            catch { mutex = new Mutex(false, @"Local\FactumIL.Bootstrap"); }
            try { owned = mutex.WaitOne(TimeSpan.FromSeconds(2)); }
            catch (AbandonedMutexException) { owned = true; }

            if (!owned)
            {
                // Another launch is bootstrapping — attach to its persisted progress
                // instead of re-running (prevents duplicate model registration).
                _logger.Log("bootstrap", "attach", LogStatus.Skipped);
                var st = LoadState();
                var attachOutcome = IsBootstrapComplete()
                    ? BootstrapOutcome.Success
                    : BootstrapOutcome.Degraded;
                return new BootstrapResult(attachOutcome, new List<string>(), new List<string>());
            }

            return await RunExclusiveAsync(progress, ct);
        }
        finally
        {
            if (owned) { try { mutex!.ReleaseMutex(); } catch { } }
            mutex?.Dispose();
        }
    }

    private async Task<BootstrapResult> RunExclusiveAsync(
        IProgress<BootstrapProgress>? progress, CancellationToken ct)
    {
        var warnings  = new List<string>();
        var errors    = new List<string>();
        var telemetry = new List<StepTelemetry>();
        var safeModeEntered = false;

        var state = LoadState();
        ReconcileVersion(state);
        state.AttemptCount += 1;
        state.Status = "Running";
        SaveState(state);

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
        int? failedStepId = null;

        for (var i = 0; i < steps.Count; i++)
        {
            var step = steps[i];
            if (ct.IsCancellationRequested) break;

            var key = step.Id.ToString();

            // ── Resume: skip steps already completed under the current version ──
            if (state.CompletedSteps.ContainsKey(key))
            {
                _logger.Log("bootstrap", step.Name, LogStatus.Skipped);
                progress?.Report(new BootstrapProgress(i + 1, steps.Count, step.DisplayName, 100, "כבר הושלם ✓"));
                continue;
            }

            state.CurrentStepId = step.Id;
            SaveState(state);

            progress?.Report(new BootstrapProgress(i + 1, steps.Count, step.DisplayName, 0, step.DisplayName));
            var stepStart = DateTime.UtcNow;
            var stepProgress = new Progress<(int Percent, string Detail)>(p =>
                progress?.Report(new BootstrapProgress(i + 1, steps.Count, step.DisplayName, p.Percent, p.Detail)));

            StepResult result;
            try
            {
                result = await step.Run(stepProgress, ct);
            }
            catch (Exception ex)
            {
                result = new StepResult(StepOutcome.RecoverableOffline, ex.Message);
            }

            var durationMs = (long)(DateTime.UtcNow - stepStart).TotalMilliseconds;
            telemetry.Add(new StepTelemetry
            {
                StepId = step.Id, StepName = step.Name, DurationMs = durationMs,
                RetryCount = result.RetryCount, Result = result.Outcome.ToString(),
            });

            switch (result.Outcome)
            {
                case StepOutcome.Ok:
                    state.CompletedSteps[key] = DateTime.UtcNow.ToString("o");
                    SaveState(state);
                    _logger.Log("bootstrap", step.Name, LogStatus.Ok, durationMs, result.Detail);
                    break;

                case StepOutcome.RecoverableOffline:
                    warnings.Add($"{step.DisplayName}: {result.Detail}");
                    outcome = BootstrapOutcome.Degraded;
                    _logger.Log("bootstrap", step.Name, LogStatus.Warn, durationMs, result.Detail);
                    // R8 — enter Safe Mode immediately on the first recoverable AI-infra
                    // failure so the app stays usable for non-AI work right away.
                    if (!safeModeEntered && (step.Id == IdOllamaRuntime || step.Id == IdOllamaModel))
                    {
                        SafeModeManager.Instance.Enter(
                            "מנוע ה-AI אינו זמין כעת — המערכת פועלת במצב מוגבל (ללא AI).");
                        safeModeEntered = true;
                    }
                    // not marked complete — retried on next launch
                    break;

                case StepOutcome.Fatal:
                    errors.Add($"{step.DisplayName}: {result.Detail}");
                    failedStepId = step.Id;
                    outcome = BootstrapOutcome.Fatal;
                    _logger.Log("bootstrap", step.Name, LogStatus.Failed, durationMs, result.Detail);
                    break;

                case StepOutcome.Skipped:
                    _logger.Log("bootstrap", step.Name, LogStatus.Skipped, durationMs, result.Detail);
                    break;
            }

            if (outcome == BootstrapOutcome.Fatal) break;
        }

        state.BootstrapVersion = CurrentVersion;
        state.LastError = errors.Count > 0 ? string.Join("; ", errors) : null;
        state.Status    = outcome == BootstrapOutcome.Fatal ? "Failed" : "Complete";
        state.UpdatedUtc = DateTime.UtcNow.ToString("o");
        SaveState(state);

        var overallSeconds = (DateTime.UtcNow - overallStart).TotalSeconds;
        _logger.LogTiming("bootstrap", resuming ? "resume-duration" : "duration",
            (long)(overallSeconds * 1000),
            resuming ? StartupBudgets.BootstrapResume : StartupBudgets.AppLaunch);

        WriteSummary(state, telemetry, outcome, failedStepId, overallSeconds);

        _logger.Log("bootstrap", "complete", outcome == BootstrapOutcome.Fatal ? LogStatus.Failed : LogStatus.Ok,
            error: outcome == BootstrapOutcome.Fatal ? state.LastError : null);

        return new BootstrapResult(outcome, warnings, errors);
    }

    private void WriteSummary(
        BootstrapState state, List<StepTelemetry> telemetry,
        BootstrapOutcome outcome, int? failedStepId, double overallSeconds)
    {
        var nowIso = DateTime.UtcNow.ToString("o");
        int? slowest = telemetry.Count > 0
            ? telemetry.OrderByDescending(t => t.DurationMs).First().StepId
            : null;
        long avg = telemetry.Count > 0
            ? (long)telemetry.Average(t => t.DurationMs)
            : 0;

        _logger.WriteBootstrapSummary(new BootstrapSummary
        {
            BootstrapVersion  = CurrentVersion,
            LastSuccessUtc    = outcome != BootstrapOutcome.Fatal ? nowIso : ReadPreviousSuccess(),
            LastFailureUtc    = outcome == BootstrapOutcome.Fatal ? nowIso : null,
            FailedStepId      = failedStepId,
            AttemptCount      = state.AttemptCount,
            DurationSeconds   = Math.Round(overallSeconds, 2),
            SlowestStepId     = slowest,
            AvgStepDurationMs = avg,
            Steps             = telemetry,
        });
    }

    // ── Step definitions ────────────────────────────────────────────────────────

    private List<Step> BuildSteps() =>
    [
        new(IdDeps,          "VerifyDependencies",  "בודק תלויות מערכת…", (_, _)  => Task.FromResult(CheckDependencies())),
        new(IdWebView2,      "VerifyWebView2",      "בודק WebView2…",      (_, _)  => Task.FromResult(CheckWebView2())),
        new(IdOllamaRuntime, "EnsureOllamaRunning", "מפעיל מנוע AI…",      RunOllamaRuntime),
        new(IdOllamaModel,   "EnsureModelRegistered","מאתחל מודל AI…",     RunOllamaModel),
        new(IdDatabase,      "VerifyDatabase",      "מאמת מסד נתונים…",    (_, ct) => VerifyDatabaseAsync(ct)),
        new(IdVectorIndex,   "VerifyVectorIndex",   "מאמת אינדקס וקטורי…", (_, ct) => VerifyFunctionalAsync("vector", ct)),
        new(IdCorpus,        "VerifyCorpus",        "מאמת מאגר משפטי…",    (_, ct) => VerifyFunctionalAsync("corpus", ct)),
    ];

    private static StepResult CheckDependencies()
    {
        var root = Environment.GetEnvironmentVariable("FACTUM_IL_ROOT");
        if (string.IsNullOrWhiteSpace(root) || !Directory.Exists(root))
            return new StepResult(StepOutcome.Fatal, "FACTUM_IL_ROOT לא מוגדר או לא קיים");

        var nodePath = Path.GetFullPath(Path.Combine(root, "..", "app", "node", "node.exe"));
        if (!File.Exists(nodePath))
            return new StepResult(StepOutcome.Fatal, $"node.exe לא נמצא: {nodePath}");

        try
        {
            var drive = new DriveInfo(Path.GetPathRoot(root)!);
            var freeMb = drive.AvailableFreeSpace / (1024L * 1024L);
            if (freeMb < 200)
                return new StepResult(StepOutcome.Fatal, $"שטח דיסק נמוך: {freeMb}MB (נדרש 200MB)");
        }
        catch { /* disk probe best-effort */ }

        return new StepResult(StepOutcome.Ok, "תלויות תקינות");
    }

    private static StepResult CheckWebView2()
    {
        // Informational — MainWindow surfaces a clear installer prompt if missing.
        return WebView2Installed()
            ? new StepResult(StepOutcome.Ok, "WebView2 מותקן")
            : new StepResult(StepOutcome.RecoverableOffline, "WebView2 חסר — יותקן/ידרוש התקנה");
    }

    private async Task<StepResult> RunOllamaRuntime(IProgress<(int, string)>? progress, CancellationToken ct)
    {
        if (!OllamaService.IsOllamaInstalled())
            return new StepResult(StepOutcome.RecoverableOffline, "Ollama אינו מותקן — מצב ללא AI");

        await _ollama.StartAsync();
        var attempts = 0;
        var ready = await RetryPolicy.RunAsync(
            _ => _ollama.PingPublicAsync(),
            new RetryOptions { Operation = "ollama-ready", MaxAttempts = 6, InitialDelay = TimeSpan.FromSeconds(1), MaxDelay = TimeSpan.FromSeconds(5), OverallTimeout = StartupBudgets.OllamaReady },
            log: msg => _logger.Log("bootstrap", "ollama-ready", LogStatus.Started, error: msg),
            onAttempt: n => attempts = n,
            ct: ct);

        var retries = Math.Max(0, attempts - 1);
        return ready
            ? new StepResult(StepOutcome.Ok, "מנוע AI פעיל", retries)
            : new StepResult(StepOutcome.RecoverableOffline, "מנוע AI לא הגיב — מצב ללא AI", retries);
    }

    private async Task<StepResult> RunOllamaModel(IProgress<(int, string)>? progress, CancellationToken ct)
    {
        if (!OllamaService.IsOllamaInstalled() || !await _ollama.PingPublicAsync())
            return new StepResult(StepOutcome.RecoverableOffline, "מנוע AI לא זמין — רישום מודל יידחה");

        var modelProgress = new Progress<(int Percent, string Status)>(t => progress?.Report((t.Percent, t.Status)));
        await _ollama.EnsureModelAsync(modelProgress);

        // Runtime/model truth is owned by OllamaLifecycle (R1).
        return _ollama.Lifecycle.Model == OllamaModelState.Ready
            ? new StepResult(StepOutcome.Ok, "מודל AI רשום ומוכן")
            : new StepResult(StepOutcome.RecoverableOffline, "רישום מודל לא הושלם — יבוצע בהפעלה הבאה");
    }

    private async Task<StepResult> VerifyDatabaseAsync(CancellationToken ct)
    {
        var health = await GetHealthAsync("/api/health", ct);
        if (health is null)
            return new StepResult(StepOutcome.Fatal, "API לא הגיב לבדיקת מסד נתונים");

        return TryReadCheck(health.Value, "db")
            ? new StepResult(StepOutcome.Ok, "מסד נתונים תקין")
            : new StepResult(StepOutcome.Fatal, "מסד נתונים אינו תקין");
    }

    private async Task<StepResult> VerifyFunctionalAsync(string component, CancellationToken ct)
    {
        var result = await FunctionalHealthChecks.CheckApiFunctionalAsync(_apiPort, ct);
        // Vector index / corpus are non-fatal: the app degrades to FTS-only / no-corpus.
        return result.Healthy
            ? new StepResult(StepOutcome.Ok, $"{component}: {result.Detail}")
            : new StepResult(StepOutcome.RecoverableOffline, $"{component} מוגבל: {result.Detail}");
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

    // ── State persistence (R2 atomic + corruption recovery) ──────────────────────

    private static readonly JsonSerializerOptions _json = new()
    {
        WriteIndented = true,
        Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
    };

    private sealed class BootstrapState
    {
        public int BootstrapVersion { get; set; } = CurrentVersion;
        public int CurrentStepId { get; set; }
        public string Status { get; set; } = "Idle";
        public string? UpdatedUtc { get; set; }
        public string? LastError { get; set; }
        public int AttemptCount { get; set; }
        public Dictionary<string, string> CompletedSteps { get; set; } = new();
    }

    /// <summary>Drop completed-step IDs no longer present in the current step set (R3/R6).</summary>
    private void ReconcileVersion(BootstrapState state)
    {
        if (state.BootstrapVersion == CurrentVersion) return;
        var validIds = BuildSteps().Select(s => s.Id.ToString()).ToHashSet();
        foreach (var key in state.CompletedSteps.Keys.Where(k => !validIds.Contains(k)).ToList())
            state.CompletedSteps.Remove(key);
        _logger.Log("bootstrap", "version-reconcile", LogStatus.Ok,
            extra: new Dictionary<string, object?> { ["from"] = state.BootstrapVersion, ["to"] = CurrentVersion });
    }

    private BootstrapState LoadState()
    {
        try
        {
            if (File.Exists(StatePath))
            {
                var json = File.ReadAllText(StatePath);
                var state = JsonSerializer.Deserialize<BootstrapState>(json, _json);
                if (state is not null) return state;
                throw new JsonException("deserialized to null");
            }
        }
        catch (Exception ex)
        {
            // Corruption recovery (R2): back up the bad file, log, start clean.
            try
            {
                var backup = StatePath + $".corrupt-{DateTime.UtcNow:yyyyMMddHHmmss}";
                if (File.Exists(StatePath)) File.Move(StatePath, backup, overwrite: true);
            }
            catch { /* best effort */ }
            _logger.Log("bootstrap", "state-corrupt", LogStatus.Warn, error: ex.Message);
        }
        return new BootstrapState();
    }

    private void SaveState(BootstrapState state)
    {
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(StatePath)!);
            var tmp  = StatePath + ".tmp";
            var json = JsonSerializer.Serialize(state, _json);
            File.WriteAllText(tmp, json);
            // Validate the temp file parses before atomically replacing the live file.
            _ = JsonSerializer.Deserialize<BootstrapState>(File.ReadAllText(tmp), _json);
            File.Move(tmp, StatePath, overwrite: true);
        }
        catch (Exception ex)
        {
            _logger.Log("bootstrap", "state-save-failed", LogStatus.Warn, error: ex.Message);
        }
    }

    private string? ReadPreviousSuccess() => _logger.ReadBootstrapSummary()?.LastSuccessUtc;

    /// <summary>True once the non-AI critical steps are complete under the current version.</summary>
    public static bool IsBootstrapComplete()
    {
        try
        {
            if (!File.Exists(StatePath)) return false;
            var state = JsonSerializer.Deserialize<BootstrapState>(File.ReadAllText(StatePath), _json);
            if (state is null || state.BootstrapVersion != CurrentVersion) return false;
            return state.CompletedSteps.ContainsKey(IdDeps.ToString())
                && state.CompletedSteps.ContainsKey(IdDatabase.ToString());
        }
        catch { return false; }
    }
}
