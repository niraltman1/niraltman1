using System.Windows;

namespace FactumIL.Desktop;

public partial class App : Application
{
    private ApiHostService?  _apiHost;
    private OllamaService?   _ollama;

    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);

        // 1. Start Node.js API server hidden (non-blocking — process is spawned).
        _apiHost = new ApiHostService();
        _apiHost.Start();

        // 2. Start Ollama AI server hidden (non-blocking — process is spawned asynchronously).
        _ollama = new OllamaService();

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
        // Step a — Start Ollama (non-blocking; StartAsync handles "not installed" gracefully).
        await _ollama!.StartAsync();

        // Step b — Wait for the Node.js API to be ready (up to 30 s).
        splash.SetApiStatus("מפעיל שרת API…");
        bool apiReady = await WaitForApiAsync(splash);

        if (!apiReady)
        {
            // Timeout — already shown MessageBox inside WaitForApiAsync.
            return;
        }

        splash.SetApiReady();

        // Step c — Wait for Ollama (up to 30 s), then ensure the model.
        if (OllamaService.IsOllamaInstalled())
        {
            splash.SetOllamaStatus("ממתין למנוע AI…");
            bool ollamaReady = await _ollama.WaitForReadyAsync();

            if (ollamaReady)
            {
                splash.SetOllamaStatus("בודק מודל AI…");
                var modelProgress = new Progress<(int Percent, string Status)>(t =>
                {
                    // Marshal to UI thread.
                    splash.Dispatcher.InvokeAsync(() =>
                        splash.SetOllamaProgress(t.Percent, t.Status));
                });

                await _ollama.EnsureModelAsync(modelProgress);
                splash.SetOllamaReady();
            }
            else
            {
                splash.SetOllamaStatus("AI לא זמין (timeout)");
            }
        }
        else
        {
            splash.SetOllamaStatus("AI לא מותקן");
        }

        // Step d — Boot complete: close splash, open main window on the UI thread.
        splash.Dispatcher.Invoke(() =>
        {
            splash.Close();
            var main = new MainWindow();
            MainWindow = main;
            main.Show();
        });
    }

    /// <summary>
    /// Polls <c>http://localhost:3001/api/health</c> every 500 ms for up to 30 s.
    /// Updates the splash status text while polling.
    /// Returns false (and shows an error MessageBox) on timeout.
    /// </summary>
    private static async Task<bool> WaitForApiAsync(SplashWindow splash)
    {
        using var http     = new System.Net.Http.HttpClient { Timeout = TimeSpan.FromSeconds(2) };
        var       deadline = DateTime.UtcNow.AddSeconds(30);
        int       attempt  = 0;

        while (DateTime.UtcNow < deadline)
        {
            attempt++;
            splash.Dispatcher.Invoke(() =>
                splash.SetApiStatus(attempt % 2 == 0 ? "ממתין לשרת API…" : "מפעיל שרת API…"));

            try
            {
                var res = await http.GetAsync("http://localhost:3001/api/health");
                if (res.IsSuccessStatusCode) return true;
            }
            catch { /* still starting */ }

            await Task.Delay(500);
        }

        splash.Dispatcher.Invoke(() =>
            MessageBox.Show(
                "שרת ה-API לא הגיב תוך 30 שניות.\nבדוק את Node.js ואת הלוגים.",
                "Factum IL — שגיאה",
                MessageBoxButton.OK,
                MessageBoxImage.Error));

        Application.Current.Dispatcher.Invoke(() => Application.Current.Shutdown(1));
        return false;
    }

    public void RestartApi() => _apiHost?.Restart();

    protected override void OnExit(ExitEventArgs e)
    {
        _apiHost?.Stop();
        _ollama?.Stop();
        base.OnExit(e);
    }
}
