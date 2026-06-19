using System.Threading.Tasks;
using System.Windows;

namespace FactumIL.Desktop;

public partial class MainWindow : Window
{
    private int _apiPort = 3001;

    public MainWindow()
    {
        InitializeComponent();
        Closing += MainWindow_Closing;
        _ = InitSourceAsync();
    }

    private async Task InitSourceAsync()
    {
        try
        {
            await WebView.EnsureCoreWebView2Async(null);
        }
        catch (Exception ex)
        {
            MessageBox.Show(
                "נכשל אתחול רכיב WebView2.\n\n" +
                "ודא ש-WebView2 Runtime מותקן (בדרך כלל מגיע עם Microsoft Edge עדכני).\n\n" +
                $"שגיאה: {ex.Message}\n\n" +
                "להתקנה ידנית הפעל:\n" +
                System.IO.Path.Combine(
                    System.IO.Path.GetDirectoryName(Environment.ProcessPath ?? "")!,
                    "tools", "MicrosoftEdgeWebview2Setup.exe"),
                "Factum IL — WebView2 חסר",
                MessageBoxButton.OK,
                MessageBoxImage.Error);
            Application.Current.Shutdown(1);
            return;
        }

        _apiPort = await ApiHostService.ReadPortAsync();
        WebView.Source = new Uri($"http://localhost:{_apiPort}");
    }

    /// <summary>Notifies the user that AI features are temporarily unavailable (safe mode).</summary>
    public void NotifyAiUnavailable(string? reason = null)
    {
        try
        {
            TrayIcon.ShowBalloonTip(
                "Factum IL — מצב מוגבל",
                reason ?? "מנוע ה-AI אינו זמין כעת. ניהול תיקים ומסמכים ממשיך לפעול כרגיל.",
                Hardcodet.Wpf.TaskbarNotification.BalloonIcon.Warning);
        }
        catch { /* tray may be disposed during shutdown */ }
    }

    /// <summary>Notifies the user that AI features have recovered.</summary>
    public void NotifyAiRestored()
    {
        try
        {
            TrayIcon.ShowBalloonTip(
                "Factum IL — AI זמין שוב",
                "מנוע ה-AI התאושש. תכונות ה-AI פעילות מחדש.",
                Hardcodet.Wpf.TaskbarNotification.BalloonIcon.Info);
        }
        catch { /* tray may be disposed during shutdown */ }
    }

    private void MainWindow_Closing(object? sender, System.ComponentModel.CancelEventArgs e)
    {
        // Minimise to tray instead of closing
        e.Cancel = true;
        Hide();
        TrayIcon.ShowBalloonTip("Factum IL", "המערכת ממשיכה לרוץ ברקע", Hardcodet.Wpf.TaskbarNotification.BalloonIcon.Info);
    }

    private void TrayMenu_Open(object sender, RoutedEventArgs e)
    {
        Show();
        WindowState = WindowState.Normal;
        Activate();
    }

    private async void TrayMenu_Restart(object sender, RoutedEventArgs e)
    {
        WebView.Source = new Uri("about:blank");
        ((App)Application.Current).RestartApi();
        _apiPort = await ApiHostService.ReadPortAsync();
        WebView.Source = new Uri($"http://localhost:{_apiPort}");
    }

    private void TrayMenu_Exit(object sender, RoutedEventArgs e)
    {
        TrayIcon.Dispose();
        Application.Current.Shutdown();
    }

    private void TrayIcon_DoubleClick(object sender, RoutedEventArgs e)
    {
        Show();
        WindowState = WindowState.Normal;
        Activate();
    }
}
