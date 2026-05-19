using System.Windows;

namespace FactumIL.Desktop;

public partial class App : Application
{
    private ApiHostService? _apiHost;

    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);
        _apiHost = new ApiHostService();
        _apiHost.Start();

        var splash = new SplashWindow();
        splash.Show();
        splash.WaitForApiReady(() =>
        {
            splash.Close();
            var main = new MainWindow();
            MainWindow = main;
            main.Show();
        });
    }

    public void RestartApi() => _apiHost?.Restart();

    protected override void OnExit(ExitEventArgs e)
    {
        _apiHost?.Stop();
        base.OnExit(e);
    }
}
