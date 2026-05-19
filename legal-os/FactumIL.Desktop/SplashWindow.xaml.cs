using System.Net.Http;
using System.Windows;
using System.Windows.Threading;

namespace FactumIL.Desktop;

public partial class SplashWindow : Window
{
    private static readonly HttpClient _http = new() { Timeout = TimeSpan.FromSeconds(2) };

    public SplashWindow() => InitializeComponent();

    public void WaitForApiReady(Action onReady)
    {
        var timer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(500) };
        int attempts = 0;
        timer.Tick += async (_, _) =>
        {
            attempts++;
            StatusText.Text = attempts % 2 == 0 ? "ממתין לשרת API…" : "מפעיל שרת API…";
            try
            {
                var res = await _http.GetAsync("http://localhost:3001/api/queue/stats");
                if (res.IsSuccessStatusCode)
                {
                    timer.Stop();
                    onReady();
                    return;
                }
            }
            catch { /* still starting */ }

            if (attempts >= 60)  // 30 second timeout
            {
                timer.Stop();
                MessageBox.Show("שרת ה-API לא הגיב תוך 30 שניות.\nבדוק את Node.js ואת הלוגים.",
                                "Factum IL — שגיאה", MessageBoxButton.OK, MessageBoxImage.Error);
                Application.Current.Shutdown(1);
            }
        };
        timer.Start();
    }
}
