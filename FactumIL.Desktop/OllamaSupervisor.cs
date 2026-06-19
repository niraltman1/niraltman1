using System.Threading;
using System.Threading.Tasks;

namespace FactumIL.Desktop;

/// <summary>
/// Long-running runtime monitor for Ollama (Enhancement 1). Where
/// <see cref="BootstrapManager"/> handles first-launch readiness, this supervisor
/// handles ongoing stability: it polls Ollama process/API/model health on a
/// configurable interval, attempts bounded automatic recovery on degradation, and
/// — if recovery is exhausted — flips <see cref="SafeModeManager"/> and escalates
/// to the recovery UI. It never blocks startup and logs every transition.
/// </summary>
public sealed class OllamaSupervisor
{
    private readonly OllamaService   _ollama;
    private readonly StartupLogger   _logger;
    private readonly SafeModeManager _safeMode;
    private readonly Action?         _onEscalate;

    private CancellationTokenSource? _cts;
    private DateTime? _degradedSince;

    public OllamaSupervisor(
        OllamaService ollama,
        StartupLogger logger,
        SafeModeManager safeMode,
        Action? onEscalate = null)
    {
        _ollama     = ollama;
        _logger     = logger;
        _safeMode   = safeMode;
        _onEscalate = onEscalate;
    }

    private static TimeSpan Interval =>
        TimeSpan.FromSeconds(EnvInt("FACTUM_IL_SUPERVISOR_INTERVAL_SEC", 30));

    private static int EnvInt(string name, int fallback)
    {
        var raw = Environment.GetEnvironmentVariable(name);
        return int.TryParse(raw, out var v) && v > 0 ? v : fallback;
    }

    /// <summary>Starts the background monitor. Idempotent. Returns immediately.</summary>
    public void Start()
    {
        if (_cts is not null) return;
        _cts = new CancellationTokenSource();
        _ = LoopAsync(_cts.Token);
        _logger.Log("supervisor", "start", LogStatus.Ok,
            extra: new Dictionary<string, object?> { ["intervalSec"] = (int)Interval.TotalSeconds });
    }

    public void Stop()
    {
        try { _cts?.Cancel(); } catch { /* best effort */ }
        _cts = null;
    }

    // ── Monitoring loop ─────────────────────────────────────────────────────────

    private async Task LoopAsync(CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            try { await Task.Delay(Interval, ct); }
            catch (OperationCanceledException) { return; }

            try { await CheckOnceAsync(ct); }
            catch (Exception ex) { _logger.Log("supervisor", "check", LogStatus.Warn, error: ex.Message); }
        }
    }

    private async Task CheckOnceAsync(CancellationToken ct)
    {
        // If Ollama was never installed, AI is intentionally unavailable — nothing to supervise.
        if (!OllamaService.IsOllamaInstalled())
            return;

        LogMemoryPressureIfHigh();

        var reachable = await _ollama.PingPublicAsync();
        var modelOk   = reachable && await _ollama.IsModelRegisteredAsync();

        if (reachable && modelOk)
        {
            // Healthy — if we were degraded, recovery is complete.
            if (_degradedSince is { } since)
            {
                var ttr = (DateTime.UtcNow - since).TotalSeconds;
                _logger.RecordFailureAnalytics(new FailureRecord
                {
                    Category              = "ollama-runtime-degraded",
                    Component             = "ollama",
                    RecoveryOutcome       = "recovered",
                    TimeToRecoverySeconds = Math.Round(ttr, 2),
                });
                _logger.Log("supervisor", "recovered", LogStatus.Recovered, (long)(ttr * 1000));
                _degradedSince = null;
            }
            if (_safeMode.IsActive) _safeMode.Exit();
            return;
        }

        // ── Degradation detected ───────────────────────────────────────────────
        _degradedSince ??= DateTime.UtcNow;
        var detail = reachable ? "model unavailable/unloaded" : "ollama API unreachable";
        _logger.Log("supervisor", "degraded", LogStatus.Warn, error: detail);

        var recovered = await RetryPolicy.RunAsync(
            async token =>
            {
                await _ollama.StartAsync();                 // restart process if it died
                if (!await _ollama.WaitForReadyAsync(token)) return false;
                await _ollama.EnsureModelAsync();           // re-register if model unloaded
                return await _ollama.IsModelRegisteredAsync();
            },
            new RetryOptions
            {
                Operation    = "ollama-recover",
                MaxAttempts  = 3,
                InitialDelay = TimeSpan.FromSeconds(2),
                MaxDelay     = TimeSpan.FromSeconds(15),
                OverallTimeout = TimeSpan.FromMinutes(2),
            },
            log: msg => _logger.Log("supervisor", "recover", LogStatus.Started, error: msg),
            ct: ct);

        if (recovered)
        {
            var ttr = _degradedSince is { } s ? (DateTime.UtcNow - s).TotalSeconds : 0;
            _logger.Log("supervisor", "recovered", LogStatus.Recovered, (long)(ttr * 1000));
            _logger.RecordFailureAnalytics(new FailureRecord
            {
                Category              = "ollama-runtime-degraded",
                Component             = "ollama",
                RecoveryOutcome       = "auto-recovered",
                TimeToRecoverySeconds = Math.Round(ttr, 2),
            });
            _degradedSince = null;
            if (_safeMode.IsActive) _safeMode.Exit();
        }
        else
        {
            // Recovery exhausted — degrade gracefully and surface to the user.
            _logger.Log("supervisor", "escalate", LogStatus.Failed, error: detail);
            _logger.RecordFailureAnalytics(new FailureRecord
            {
                Category        = "ollama-runtime-degraded",
                Component       = "ollama",
                RecoveryOutcome = "escalated-safe-mode",
            });
            _safeMode.Enter("מנוע ה-AI אינו זמין — המערכת פועלת במצב מוגבל (ללא AI).");
            _onEscalate?.Invoke();
        }
    }

    private void LogMemoryPressureIfHigh()
    {
        try
        {
            var info = GC.GetGCMemoryInfo();
            if (info.HighMemoryLoadThresholdBytes <= 0) return;
            var load = (double)info.MemoryLoadBytes / info.HighMemoryLoadThresholdBytes;
            if (load >= 0.95)
                _logger.Log("supervisor", "memory-pressure", LogStatus.Warn,
                    error: $"system memory load {load:P0}");
        }
        catch { /* best effort */ }
    }
}
