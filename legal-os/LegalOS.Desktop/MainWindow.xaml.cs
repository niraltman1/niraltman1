using System.Windows;

namespace LegalOS.Desktop;

public partial class MainWindow : Window
{
    public MainWindow()
    {
        InitializeComponent();
        Closing += MainWindow_Closing;
    }

    private void MainWindow_Closing(object? sender, System.ComponentModel.CancelEventArgs e)
    {
        // Minimise to tray instead of closing
        e.Cancel = true;
        Hide();
        TrayIcon.ShowBalloonTip("Legal-OS", "המערכת ממשיכה לרוץ ברקע", Hardcodet.Wpf.TaskbarNotification.BalloonIcon.Info);
    }

    private void TrayMenu_Open(object sender, RoutedEventArgs e)
    {
        Show();
        WindowState = WindowState.Normal;
        Activate();
    }

    private void TrayMenu_Restart(object sender, RoutedEventArgs e)
    {
        WebView.Source = new Uri("about:blank");
        ((App)Application.Current).RestartApi();
        WebView.Source = new Uri("http://localhost:3001");
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
