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
        _apiPort = await ApiHostService.ReadPortAsync();
        WebView.Source = new Uri($"http://localhost:{_apiPort}");
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
