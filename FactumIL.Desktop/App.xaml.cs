using System.Windows;

namespace FactumIL.Desktop;

public partial class App : Application
{
    private ApiHostService?    _apiHost;
    private OllamaService?     _ollama;
    private OllamaSupervisor?  _supervisor;
    private readonly StartupLogger    _logger      = new();
    private readonly DiagnosticsService _diagnostics = new();

    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);

        // Install global crash handlers as early as possible.
        DiagnosticsService.InstallGlobalHandlers(_diagnostics);
        _logger.Log("app", "startup", LogStatus.Started);

        // 1. Start Node.js API server hidden (non-blocking — process is spawned).
        _apiHost = new ApiHostService();
        _apiHost.Start();

        // 2. Create the Ollama service (shares the structured logger for lifecycle tracing).
        _ollama = new OllamaService(_logger);

        // Surface safe-mode transitions to the user (the dashboard also degrades on
        // /api/health ai_ready=false; this is the human-visible notification).
        SafeModeManager.Instance.SafeModeChanged += OnSafeModeChanged;

        // Warn once (in Hebrew) if Ollama is not installed — then continue.
        if (!OllamaService.IsOllamaInstalled())
        {
            MessageBox.Show(
                "Ollama אינו מותקן במחשב זה.\n\n" +
                "תכונות ה-AI (ניתוח מסמכים, זיהוי מזהים משפטיים, סיכום תיקים) לא יהיו זמינות.\n\n" +
                "להתקנה: https://ollama.com/download",
                "Factum IL — AI לא זמין",
                MessageBoxButton.OK,
                MessageBoxImage.Warning);
        }

        // 3. Show splash window.
        var splash = new SplashWindow();
        splash.Show();

        // 4. Run the full boot sequence on a background task so the UI thread stays
        //    responsive (splash animations, etc.).
        _ = RunBootSequenceAsync(splash);
    }

    private async Task RunBootSequenceAsync(SplashWindow splash)
    {
        var bootStart = DateTime.UtcNow;

        // Step a — Start Ollama (non-blocking; StartAsync handles "not installed" gracefully).
        await _ollama!.StartAsync();

        // Step b — Discover actual port (Node may use 3002+ if 3001 is busy), then wait for API.
        splash.SetApiStatus("מפעיל שרת API…");
        int apiPort = await ApiHostService.ReadPortAsync();
        bool apiReady = await WaitForApiAsync(splash, apiPort);

        if (!apiReady)
        {
            // API never came up — this is the only hard prerequisite. Offer recovery
            // instead of an immediate fatal exit (Shutdown), so the user can export a
            // support bundle, open logs, or retry in safe mode.
            _logger.Log("app", "api-timeout", LogStatus.Failed);
            ShowRecoveryWindow(
                splash,
                new List<string>(),
                new List<string> { "שרת ה-API לא הגיב בזמן. ראה לוגים לפרטים." },
                apiPort);
            return;
        }

        splash.SetApiReady();
        _logger.LogTiming("app", "api-ready", (long)(DateTime.UtcNow - bootStart).TotalMilliseconds, StartupBudgets.ApiReady);

        // Step c — Resumable first-launch bootstrap: ensure Ollama + model + verify
        //          database / vector / corpus. Heavy init lives here (NOT the installer).
        var bootstrap = new BootstrapManager(_ollama, _logger, apiPort);
        var progress  = new Progress<BootstrapProgress>(p =>
            splash.SetOllamaProgress(p.Percent, $"{p.StepName} {p.Detail}".Trim()));
        var bootstrapResult = await bootstrap.RunAsync(progress);

        if (bootstrapResult.Outcome == BootstrapOutcome.Success)
            splash.SetOllamaReady();
        else
            splash.SetOllamaStatus(_ollama.Lifecycle.IsFullyReady ? "מנוע AI מוכן ✓" : "AI לא זמין — מצב מוגבל");

        // Step d — Validate system state (diagnostic snapshot + recovery inputs).
        splash.Dispatcher.Invoke(() => splash.SetApiStatus("מאמת מצב מערכת…"));
        var validator        = new StartupValidator();
        var validationResult  = await validator.ValidateAsync();
        _ = _diagnostics.RecordStartupDiagnosticAsync(validationResult);

        // Step e — Fatal bootstrap failure OR unhealthy validation → recovery window.
        if (bootstrapResult.Outcome == BootstrapOutcome.Fatal || !validationResult.IsHealthy)
        {
            var warnings = new List<string>(validationResult.Warnings);
            warnings.AddRange(bootstrapResult.Warnings);
            var errors = new List<string>(validationResult.Errors);
            errors.AddRange(bootstrapResult.Errors);

            ShowRecoveryWindow(splash, warnings, errors, apiPort);
            return;
        }

        // Degraded (AI unavailable) is non-fatal: enter safe mode so the app stays
        // usable for non-AI work; the supervisor keeps retrying and exits safe mode
        // automatically when the AI stack recovers.
        if (bootstrapResult.Outcome == BootstrapOutcome.Degraded && !_ollama.Lifecycle.IsFullyReady)
            SafeModeManager.Instance.Enter("מנוע ה-AI אינו זמין כעת — המערכת פועלת במצב מוגבל (ללא AI).");

        splash.Dispatcher.Invoke(() => splash.Close());

        // Step f — Boot complete: open main window on the UI thread.
        Dispatcher.Invoke(() =>
        {
            var main = new MainWindow();
            MainWindow = main;
            main.Show();
        });

        _logger.LogTiming("app", "boot-complete", (long)(DateTime.UtcNow - bootStart).TotalMilliseconds, StartupBudgets.AppLaunch);

        // Step g — Start the runtime supervisor (after startup; never blocks it).
        _supervisor = new OllamaSupervisor(_ollama, _logger, SafeModeManager.Instance,
            onEscalate: () => Dispatcher.InvokeAsync(() =>
                (MainWindow as FactumIL.Desktop.MainWindow)?.NotifyAiUnavailable()));
        _supervisor.Start();
    }

    /// <summary>
    /// Shows the recovery window on the UI thread. If the user chooses to continue,
    /// restarts the API in safe mode and opens the main window in degraded state.
    /// </summary>
    private void ShowRecoveryWindow(SplashWindow splash, List<string> warnings, List<string> errors, int apiPort)
    {
        var repair = _ollama is not null ? new RepairManager(_ollama, _logger, apiPort) : null;
        bool shouldContinue = false;
        splash.Dispatcher.Invoke(() =>
        {
            splash.Close();
            var recovery = new RecoveryWindow(warnings, errors, _diagnostics, repair);
            shouldContinue = recovery.ShowDialog() == true;
        });

        if (!shouldContinue) return; // user exited (RecoveryWindow already shut down)

        // Continue in safe mode — API restarts with background workers disabled.
        SafeModeManager.Instance.Enter("המערכת הופעלה במצב התאוששות (ללא AI).");
        _apiHost?.Stop();
        Task.Run(async () =>
        {
            await Task.Delay(500); // let the port be released
            _apiHost?.Start(safeMode: true);
            int recoveryPort = await ApiHostService.ReadPortAsync();
            await WaitForApiSilentAsync(recoveryPort);
            Dispatcher.Invoke(() =>
            {
                var main = new MainWindow();
                MainWindow = main;
                main.Show();
            });
        });
    }

    private void OnSafeModeChanged(bool active, string? reason)
    {
        Dispatcher.InvokeAsync(() =>
        {
            if (active)
                (MainWindow as FactumIL.Desktop.MainWindow)?.NotifyAiUnavailable(reason);
            else
                (MainWindow as FactumIL.Desktop.MainWindow)?.NotifyAiRestored();
        });
    }

    /// <summary>
    /// Polls the API health endpoint every 500 ms until it responds or the
    /// (env-configurable) budget elapses. Returns false on timeout — the caller
    /// decides how to recover (no hard Shutdown here).
    /// </summary>
    private async Task<bool> WaitForApiAsync(SplashWindow splash, int port = 3001)
    {
        var timeoutSec = ReadEnvInt("FACTUM_IL_API_TIMEOUT_SEC", 90);
        using var http     = new System.Net.Http.HttpClient { Timeout = TimeSpan.FromSeconds(2) };
        var       url      = $"http://localhost:{port}/api/health";
        var       deadline = DateTime.UtcNow.AddSeconds(timeoutSec);
        int       attempt  = 0;

        while (DateTime.UtcNow < deadline)
        {
            attempt++;
            splash.Dispatcher.Invoke(() =>
                splash.SetApiStatus(attempt % 2 == 0 ? "ממתין לשרת API…" : "מפעיל שרת API…"));

            try
            {
                var res = await http.GetAsync(url);
                if (res.IsSuccessStatusCode) return true;
            }
            catch { /* still starting */ }

            await Task.Delay(500);
        }

        return false;
    }

    /// <summary>
    /// Silent version of WaitForApiAsync — used after safe-mode restart when no splash
    /// window is available. Polls for up to 20 seconds with no UI feedback.
    /// </summary>
    private static async Task WaitForApiSilentAsync(int port = 3001)
    {
        using var http     = new System.Net.Http.HttpClient { Timeout = TimeSpan.FromSeconds(2) };
        var       url      = $"http://localhost:{port}/api/health";
        var       deadline = DateTime.UtcNow.AddSeconds(20);

        while (DateTime.UtcNow < deadline)
        {
            try
            {
                var res = await http.GetAsync(url);
                if (res.IsSuccessStatusCode) return;
            }
            catch { /* still starting */ }

            await Task.Delay(500);
        }
        // If still not up after 20 s, continue anyway — MainWindow will show degraded state.
    }

    private static int ReadEnvInt(string name, int fallback)
    {
        var raw = Environment.GetEnvironmentVariable(name);
        return int.TryParse(raw, out var v) && v > 0 ? v : fallback;
    }

    public void RestartApi() => _apiHost?.Restart();

    protected override void OnExit(ExitEventArgs e)
    {
        _supervisor?.Stop();
        _apiHost?.Stop();
        _ollama?.Stop();
        _logger.Log("app", "exit", LogStatus.Ok);
        base.OnExit(e);
    }
}
