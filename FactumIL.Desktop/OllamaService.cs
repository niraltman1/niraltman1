using System.Diagnostics;
using System.IO;
using System.Net.Http;
using System.Text;
using System.Text.Json;

namespace FactumIL.Desktop;

/// <summary>
/// Manages the Ollama AI server lifecycle and ensures the required model is available.
/// All methods fail gracefully — if Ollama is not installed or unavailable, the flag
/// <see cref="IsAvailable"/> is set to false and the app continues without AI features.
/// </summary>
internal sealed class OllamaService
{
    public const string RequiredModel = "BrainboxAI/law-il-E2B:Q4_K_M";

    private static readonly HttpClient _http = new() { Timeout = TimeSpan.FromSeconds(5) };
    private static readonly string[] _ollamaPaths =
    [
        Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "Programs", "Ollama", "ollama.exe"),
        Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
            "Ollama", "ollama.exe"),
    ];

    private readonly StartupLogger _logger;
    private Process? _ollamaProcess;

    /// <summary>Explicit, deterministic runtime + model state for diagnostics.</summary>
    public OllamaLifecycle Lifecycle { get; }

    public OllamaService(StartupLogger? logger = null)
    {
        _logger   = logger ?? new StartupLogger();
        Lifecycle = new OllamaLifecycle(
            onTransition: (field, state) => _logger.Log("ollama", $"{field}={state}", LogStatus.Ok),
            onIllegal:    msg => _logger.Log("ollama", "illegal-transition", LogStatus.Warn, error: msg));
        Lifecycle.SetRuntime(IsOllamaInstalled()
            ? OllamaRuntimeState.Installed
            : OllamaRuntimeState.NotInstalled);
    }

    // ── Configurable timeouts (env-overridable; never unbounded) ────────────────

    private static TimeSpan ReadyTimeout =>
        TimeSpan.FromSeconds(EnvInt("FACTUM_IL_OLLAMA_READY_TIMEOUT_SEC", 30));

    private static TimeSpan CreateTimeout =>
        TimeSpan.FromMinutes(EnvInt("FACTUM_IL_OLLAMA_CREATE_TIMEOUT_MIN", 30));

    private static TimeSpan PullTimeout =>
        TimeSpan.FromMinutes(EnvInt("FACTUM_IL_OLLAMA_PULL_TIMEOUT_MIN", 60));

    private static int EnvInt(string name, int fallback)
    {
        var raw = Environment.GetEnvironmentVariable(name);
        return int.TryParse(raw, out var v) && v > 0 ? v : fallback;
    }

    /// <summary>
    /// True when Ollama is reachable and the required model is present (or was pulled).
    /// Set after a complete boot sequence.
    /// </summary>
    public bool IsAvailable { get; private set; }

    // ── Public helpers ────────────────────────────────────────────────────────

    /// <summary>
    /// Returns the path to ollama.exe if it is installed, or null.
    /// </summary>
    public static string? FindOllamaExe()
    {
        foreach (var path in _ollamaPaths)
            if (File.Exists(path)) return path;
        return null;
    }

    /// <summary>
    /// Returns true when ollama.exe exists in any of the known install locations.
    /// </summary>
    public static bool IsOllamaInstalled() => FindOllamaExe() is not null;

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    /// <summary>
    /// Starts the Ollama server in the background if it is not already running.
    /// Does nothing (and does not throw) if Ollama is not installed.
    /// </summary>
    public async Task StartAsync()
    {
        try
        {
            // Already reachable — nothing to do.
            if (await PingAsync())
            {
                Lifecycle.SetRuntime(OllamaRuntimeState.Ready);
                return;
            }

            var exe = FindOllamaExe();
            if (exe is null)
            {
                Lifecycle.SetRuntime(OllamaRuntimeState.NotInstalled);
                return; // not installed — caller will warn
            }

            Lifecycle.SetRuntime(OllamaRuntimeState.Starting);

            var psi = new ProcessStartInfo
            {
                FileName        = exe,
                Arguments       = "serve",
                UseShellExecute = false,
                CreateNoWindow  = true,
                WindowStyle     = ProcessWindowStyle.Hidden,
            };

            _ollamaProcess = Process.Start(psi);
            // Give it a moment to bind the port before the caller calls WaitForReadyAsync.
            await Task.Delay(500);
        }
        catch (Exception ex)
        {
            Lifecycle.SetRuntime(OllamaRuntimeState.Failed);
            LogWarning($"StartAsync failed: {ex.Message}");
        }
    }

    /// <summary>
    /// Polls <c>http://localhost:11434/api/tags</c> every 500 ms for up to 30 seconds.
    /// Returns true when Ollama responds, false on timeout.
    /// Never throws.
    /// </summary>
    public async Task<bool> WaitForReadyAsync(CancellationToken ct = default)
    {
        try
        {
            var deadline = DateTime.UtcNow.Add(ReadyTimeout);
            while (DateTime.UtcNow < deadline)
            {
                if (ct.IsCancellationRequested) return false;
                if (await PingAsync())
                {
                    Lifecycle.SetRuntime(OllamaRuntimeState.Ready);
                    return true;
                }
                await Task.Delay(500, ct);
            }
        }
        catch (OperationCanceledException) { }
        catch (Exception ex) { LogWarning($"WaitForReadyAsync failed: {ex.Message}"); }

        Lifecycle.SetRuntime(OllamaRuntimeState.Failed);
        return false;
    }

    /// <summary>Public, non-throwing reachability probe (used by supervisor/repair).</summary>
    public Task<bool> PingPublicAsync() => PingAsync();

    /// <summary>Public, non-throwing check that the required model is registered.</summary>
    public Task<bool> IsModelRegisteredAsync() => ModelExistsAsync();

    /// <summary>
    /// Checks whether <see cref="RequiredModel"/> is present in Ollama.
    /// If not, pulls it from the Ollama registry, streaming NDJSON progress lines.
    /// Reports progress via <paramref name="progress"/> as (percent 0-100, status string).
    /// Sets <see cref="IsAvailable"/> = true on success, false on failure.
    /// Never throws.
    /// </summary>
    public async Task EnsureModelAsync(IProgress<(int Percent, string Status)>? progress = null)
    {
        try
        {
            if (!await PingAsync())
            {
                LogWarning("EnsureModelAsync: Ollama not reachable.");
                Lifecycle.SetModel(OllamaModelState.Failed);
                IsAvailable = false;
                return;
            }

            progress?.Report((0, "בודק מודל AI…"));

            if (await ModelExistsAsync())
            {
                progress?.Report((100, "מודל AI מוכן"));
                Lifecycle.SetModel(OllamaModelState.Ready);
                IsAvailable = true;
                return;
            }

            Lifecycle.SetModel(OllamaModelState.Registering);

            var localGguf = GetBundledGgufPath();

            // Registration can be lengthy and occasionally fails mid-stream; retry with
            // bounded exponential backoff so first-launch bootstrap is resilient but never
            // hangs forever. Each attempt is itself bounded by the create/pull HTTP timeout.
            var registered = await RetryPolicy.RunAsync(
                async _ =>
                {
                    if (localGguf is not null)
                    {
                        progress?.Report((0, "טוען מודל AI מהדיסק…"));
                        await CreateFromLocalAsync(localGguf, progress);
                    }
                    else
                    {
                        progress?.Report((0, "מוריד מודל AI (עשוי לקחת מספר דקות)…"));
                        await PullModelAsync(progress);
                    }
                    // Confirm the model is actually present before declaring success.
                    return await ModelExistsAsync();
                },
                new RetryOptions
                {
                    Operation    = "ollama-model-register",
                    MaxAttempts  = 3,
                    InitialDelay = TimeSpan.FromSeconds(3),
                    MaxDelay     = TimeSpan.FromSeconds(20),
                },
                log: msg => _logger.Log("ollama", "model-register", LogStatus.Started, error: msg));

            if (registered)
            {
                Lifecycle.SetModel(OllamaModelState.Ready);
                IsAvailable = true;
            }
            else
            {
                Lifecycle.SetModel(OllamaModelState.Failed);
                IsAvailable = false;
            }
        }
        catch (Exception ex)
        {
            LogWarning($"EnsureModelAsync failed: {ex.Message}");
            Lifecycle.SetModel(OllamaModelState.Failed);
            IsAvailable = false;
        }
    }

    /// <summary>Stops the Ollama process that this service started (if any).</summary>
    public void Stop()
    {
        try { _ollamaProcess?.Kill(entireProcessTree: true); }
        catch { /* best effort */ }
        _ollamaProcess = null;
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private static async Task<bool> PingAsync()
    {
        try
        {
            using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(3));
            var res = await _http.GetAsync("http://localhost:11434/api/tags", cts.Token);
            return res.IsSuccessStatusCode;
        }
        catch { return false; }
    }

    private static async Task<bool> ModelExistsAsync()
    {
        try
        {
            var json = await _http.GetStringAsync("http://localhost:11434/api/tags");
            // Look for the model name in the JSON response.
            return json.Contains(RequiredModel, StringComparison.OrdinalIgnoreCase);
        }
        catch { return false; }
    }

    // FACTUM_IL_ROOT = {app}\app; GGUF is installed to {app}\models\
    private static string? GetBundledGgufPath()
    {
        var factumRoot = Environment.GetEnvironmentVariable("FACTUM_IL_ROOT");
        if (string.IsNullOrEmpty(factumRoot)) return null;
        var path = Path.GetFullPath(Path.Combine(factumRoot, "..", "models", "gemma-4-E2B-it.BF16-mmproj.gguf"));
        return File.Exists(path) ? path : null;
    }

    private static async Task CreateFromLocalAsync(string ggufPath, IProgress<(int Percent, string Status)>? progress)
    {
        var modelfile = $"FROM {ggufPath}";
        var body      = JsonSerializer.Serialize(new { model = RequiredModel, modelfile, stream = true });
        var content   = new StringContent(body, Encoding.UTF8, "application/json");

        using var createClient = new HttpClient { Timeout = CreateTimeout };
        using var response     = await createClient.PostAsync("http://localhost:11434/api/create", content);
        response.EnsureSuccessStatusCode();

        await using var stream = await response.Content.ReadAsStreamAsync();
        using var reader       = new System.IO.StreamReader(stream);

        while (!reader.EndOfStream)
        {
            var line = await reader.ReadLineAsync();
            if (string.IsNullOrWhiteSpace(line)) continue;
            try
            {
                using var doc = JsonDocument.Parse(line);
                var root      = doc.RootElement;
                var status    = root.TryGetProperty("status", out var s) ? s.GetString() ?? "" : "";
                progress?.Report((50, string.IsNullOrEmpty(status) ? "טוען מודל AI…" : status));
            }
            catch { /* skip malformed NDJSON */ }
        }

        progress?.Report((100, "מודל AI נטען בהצלחה"));
    }

    private static async Task PullModelAsync(IProgress<(int Percent, string Status)>? progress)
    {
        var body    = JsonSerializer.Serialize(new { name = RequiredModel, stream = true });
        var content = new StringContent(body, Encoding.UTF8, "application/json");

        // Use a long-timeout client for the pull (model can be several GB).
        using var pullClient = new HttpClient { Timeout = PullTimeout };
        using var response   = await pullClient.PostAsync(
            "http://localhost:11434/api/pull", content);

        response.EnsureSuccessStatusCode();

        await using var stream = await response.Content.ReadAsStreamAsync();
        using var reader       = new System.IO.StreamReader(stream);

        while (!reader.EndOfStream)
        {
            var line = await reader.ReadLineAsync();
            if (string.IsNullOrWhiteSpace(line)) continue;

            try
            {
                using var doc  = JsonDocument.Parse(line);
                var root       = doc.RootElement;

                var status     = root.TryGetProperty("status",    out var s) ? s.GetString() ?? "" : "";
                var completed  = root.TryGetProperty("completed", out var c) && c.ValueKind == JsonValueKind.Number
                                    ? c.GetInt64() : 0L;
                var total      = root.TryGetProperty("total",     out var t) && t.ValueKind == JsonValueKind.Number
                                    ? t.GetInt64() : 0L;

                int percent = (total > 0) ? (int)((completed * 100L) / total) : 0;
                var display = string.IsNullOrEmpty(status) ? "מוריד מודל AI…" : status;
                progress?.Report((percent, display));
            }
            catch
            {
                // Malformed NDJSON line — skip and continue.
            }
        }

        progress?.Report((100, "מודל AI הורד בהצלחה"));
    }

    private static void LogWarning(string message)
    {
        try
        {
            var logDir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "FactumIL", "logs");
            Directory.CreateDirectory(logDir);
            File.AppendAllText(
                Path.Combine(logDir, "ollama.log"),
                $"[{DateTime.Now:HH:mm:ss}] WARN {message}{Environment.NewLine}");
        }
        catch { /* cannot log — swallow silently */ }
    }
}
