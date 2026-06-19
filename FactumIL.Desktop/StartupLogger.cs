using System.Collections.Generic;
using System.IO;
using System.Text.Json;

namespace FactumIL.Desktop;

/// <summary>Outcome of a single logged step/event.</summary>
public enum LogStatus
{
    Started,
    Ok,
    Warn,
    Skipped,
    Failed,
    Recovered,
}

/// <summary>
/// Measurable startup performance targets (Enhancement 7). Actual timings are
/// recorded by <see cref="StartupLogger"/>; a breach is logged as a warning and
/// surfaced in diagnostics. These are budgets, not hard deadlines — exceeding one
/// degrades the perf signal, it does not fail startup.
/// </summary>
public static class StartupBudgets
{
    public static readonly TimeSpan AppLaunch         = TimeSpan.FromSeconds(10);
    public static readonly TimeSpan ApiReady          = TimeSpan.FromSeconds(15);
    public static readonly TimeSpan OllamaReady        = TimeSpan.FromSeconds(30);
    public static readonly TimeSpan BootstrapResume   = TimeSpan.FromSeconds(5);
    public static readonly TimeSpan RecoveryDetection = TimeSpan.FromSeconds(10);
}

/// <summary>
/// Structured, single-line JSON logger for the installer/bootstrap/runtime
/// lifecycle (Enhancement 9 observability). Writes newline-delimited JSON to
/// <c>%LOCALAPPDATA%\FactumIL\logs\bootstrap.jsonl</c> with a stable schema
/// (<c>timestamp, component, event, status, durationMs, error</c>) and maintains
/// <c>bootstrap-summary.json</c> — the last bootstrap outcome snapshot with per-step
/// telemetry — for support.
/// All methods are best-effort and never throw.
/// </summary>
public sealed class StartupLogger
{
    private static readonly string LogDir = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "FactumIL", "logs");

    private static readonly string JsonlPath   = Path.Combine(LogDir, "bootstrap.jsonl");
    private static readonly string SummaryPath = Path.Combine(LogDir, "bootstrap-summary.json");

    private static readonly object _gate = new();

    private static readonly JsonSerializerOptions _json = new()
    {
        WriteIndented = false,
        // Hebrew/RTL text appears in some messages — keep it readable, not \uXXXX escaped.
        Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
    };

    private static readonly JsonSerializerOptions _jsonPretty = new()
    {
        WriteIndented = true,
        Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
    };

    // ── Structured event log ────────────────────────────────────────────────────

    public void Log(
        string component,
        string @event,
        LogStatus status,
        long durationMs = 0,
        string? error = null,
        IReadOnlyDictionary<string, object?>? extra = null)
    {
        try
        {
            Directory.CreateDirectory(LogDir);

            var record = new Dictionary<string, object?>
            {
                ["timestamp"]  = DateTime.UtcNow.ToString("o"),
                ["component"]  = component,
                ["event"]      = @event,
                ["status"]     = status.ToString().ToLowerInvariant(),
                ["durationMs"] = durationMs,
            };
            if (!string.IsNullOrEmpty(error)) record["error"] = error;
            if (extra is not null)
                foreach (var kv in extra) record[kv.Key] = kv.Value;

            var line = JsonSerializer.Serialize(record, _json);
            lock (_gate) File.AppendAllText(JsonlPath, line + Environment.NewLine);
        }
        catch { /* logging must never crash the host */ }
    }

    /// <summary>Logs a perf measurement and warns when it breaches its budget.</summary>
    public void LogTiming(string component, string @event, long durationMs, TimeSpan budget)
    {
        var overBudget = durationMs > budget.TotalMilliseconds;
        Log(component, @event, overBudget ? LogStatus.Warn : LogStatus.Ok, durationMs,
            error: overBudget ? $"exceeded budget {budget.TotalMilliseconds:0}ms" : null,
            extra: new Dictionary<string, object?> { ["budgetMs"] = (long)budget.TotalMilliseconds });
    }

    // ── Aggregate artifacts ─────────────────────────────────────────────────────

    /// <summary>Overwrites <c>bootstrap-summary.json</c> with the latest snapshot.</summary>
    public void WriteBootstrapSummary(BootstrapSummary summary)
    {
        try
        {
            Directory.CreateDirectory(LogDir);
            var json = JsonSerializer.Serialize(summary, _jsonPretty);
            lock (_gate) File.WriteAllText(SummaryPath, json);
        }
        catch { /* best effort */ }
    }

    public BootstrapSummary? ReadBootstrapSummary()
    {
        try
        {
            if (!File.Exists(SummaryPath)) return null;
            lock (_gate)
            {
                var json = File.ReadAllText(SummaryPath);
                return JsonSerializer.Deserialize<BootstrapSummary>(json, _json);
            }
        }
        catch { return null; }
    }
}

/// <summary>Per-step telemetry captured for every bootstrap step (R9).</summary>
public sealed record StepTelemetry
{
    public int    StepId     { get; init; }
    public string StepName   { get; init; } = "";
    public long   DurationMs { get; init; }
    public int    RetryCount { get; init; }
    public string Result     { get; init; } = "";
}

/// <summary>Snapshot written to <c>bootstrap-summary.json</c>.</summary>
public sealed record BootstrapSummary
{
    public int     BootstrapVersion { get; init; }
    public string? LastSuccessUtc   { get; init; }
    public string? LastFailureUtc   { get; init; }
    public int?    FailedStepId     { get; init; }
    public int     AttemptCount     { get; init; }
    public double  DurationSeconds  { get; init; }
    public int?    SlowestStepId    { get; init; }
    public long    AvgStepDurationMs { get; init; }
    public List<StepTelemetry> Steps { get; init; } = new();
}
