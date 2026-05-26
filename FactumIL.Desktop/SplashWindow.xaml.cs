using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;

namespace FactumIL.Desktop;

public partial class SplashWindow : Window
{
    public SplashWindow() => InitializeComponent();

    // ── API status ────────────────────────────────────────────────────────────

    public void SetApiStatus(string message) =>
        Dispatcher.InvokeAsync(() => ApiStatusText.Text = message);

    public void SetApiReady() =>
        Dispatcher.InvokeAsync(() =>
        {
            ApiStatusText.Text             = "שרת API מוכן ✓";
            ApiProgressBar.IsIndeterminate = false;
            ApiProgressBar.Value           = 100;
            ApiProgressBar.Foreground      = new SolidColorBrush(Color.FromRgb(0x4C, 0xAF, 0x50));
        });

    // ── Ollama / AI status ────────────────────────────────────────────────────

    public void SetOllamaStatus(string message) =>
        Dispatcher.InvokeAsync(() => OllamaStatusText.Text = message);

    public void SetOllamaProgress(int percent, string detail) =>
        Dispatcher.InvokeAsync(() =>
        {
            OllamaProgressBar.IsIndeterminate = false;
            OllamaProgressBar.Value           = percent;
            OllamaStatusText.Text             = detail;
            OllamaPercentText.Text            = percent > 0 ? $"{percent}%" : "";
        });

    public void SetOllamaReady() =>
        Dispatcher.InvokeAsync(() =>
        {
            OllamaStatusText.Text             = "מנוע AI מוכן ✓";
            OllamaProgressBar.IsIndeterminate = false;
            OllamaProgressBar.Value           = 100;
            OllamaPercentText.Text            = "";
        });
}
