using System.Diagnostics;
using System.IO;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;

namespace FactumIL.Desktop;

/// <summary>
/// Recovery mode window shown when <see cref="StartupValidator"/> reports
/// <c>IsHealthy = false</c> but <c>CanContinue = true</c>.
/// The user can choose to continue anyway, export a support bundle,
/// open the logs folder, or exit.
/// </summary>
public partial class RecoveryWindow : Window
{
    private static readonly string LogsPath = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "FactumIL", "logs");

    private readonly DiagnosticsService _diagnostics;

    // ── Constructor ───────────────────────────────────────────────────────────

    /// <summary>
    /// Creates the recovery window and populates the issue list.
    /// </summary>
    /// <param name="warnings">Non-fatal issues from the validator.</param>
    /// <param name="errors">Fatal issues from the validator.</param>
    /// <param name="diagnostics">Service used to handle support bundle requests.</param>
    public RecoveryWindow(
        List<string> warnings,
        List<string> errors,
        DiagnosticsService diagnostics)
    {
        _diagnostics = diagnostics;
        InitializeComponent();
        PopulateIssues(errors, warnings);
    }

    // ── UI population ─────────────────────────────────────────────────────────

    private void PopulateIssues(List<string> errors, List<string> warnings)
    {
        // Errors first (red), then warnings (amber)
        foreach (var error in errors)
            IssuePanel.Children.Add(BuildIssueRow(error, isError: true));

        foreach (var warning in warnings)
            IssuePanel.Children.Add(BuildIssueRow(warning, isError: false));

        if (errors.Count == 0 && warnings.Count == 0)
        {
            IssuePanel.Children.Add(new TextBlock
            {
                Text       = "לא נמצאו בעיות.",
                Foreground = Brushes.White,
                FontFamily = new FontFamily("Segoe UI"),
                FontSize   = 13,
                Opacity    = 0.6,
                Margin     = new Thickness(0, 4, 0, 4),
            });
        }
    }

    private static Border BuildIssueRow(string message, bool isError)
    {
        var bullet = new TextBlock
        {
            Text       = isError ? "✖" : "⚠",
            Foreground = isError
                ? new SolidColorBrush(Color.FromRgb(0xEF, 0x53, 0x50))  // red
                : new SolidColorBrush(Color.FromRgb(0xFF, 0xA7, 0x26)), // amber
            FontSize   = 14,
            VerticalAlignment = VerticalAlignment.Top,
            Margin     = new Thickness(0, 2, 8, 0),
        };

        var text = new TextBlock
        {
            Text         = message,
            Foreground   = new SolidColorBrush(Color.FromRgb(0xE8, 0xD9, 0xB5)),
            FontFamily   = new FontFamily("Segoe UI"),
            FontSize     = 12,
            TextWrapping = TextWrapping.Wrap,
        };

        var row = new StackPanel { Orientation = Orientation.Horizontal };
        row.Children.Add(bullet);
        row.Children.Add(text);

        return new Border
        {
            Child         = row,
            Margin        = new Thickness(0, 4, 0, 4),
            Padding       = new Thickness(10, 8, 10, 8),
            CornerRadius  = new CornerRadius(4),
            Background    = isError
                ? new SolidColorBrush(Color.FromArgb(0x22, 0xEF, 0x53, 0x50))
                : new SolidColorBrush(Color.FromArgb(0x22, 0xFF, 0xA7, 0x26)),
        };
    }

    // ── Button handlers ───────────────────────────────────────────────────────

    private void ContinueButton_Click(object sender, RoutedEventArgs e)
    {
        DialogResult = true;
        Close();
    }

    private async void BundleButton_Click(object sender, RoutedEventArgs e)
    {
        BundleButton.IsEnabled = false;
        BundleButton.Content   = "שולח בקשה…";
        try
        {
            await _diagnostics.RequestSupportBundleAsync();
            BundleButton.Content = "הבקשה נשלחה ✓";
        }
        catch
        {
            BundleButton.Content = "שגיאה בשליחה";
        }
        // Re-enable after a short visual delay (no blocking sleep — just leave the label)
    }

    private void LogsButton_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            Directory.CreateDirectory(LogsPath);
            Process.Start(new ProcessStartInfo
            {
                FileName        = "explorer.exe",
                Arguments       = $"\"{LogsPath}\"",
                UseShellExecute = true,
            });
        }
        catch (Exception ex)
        {
            MessageBox.Show(
                $"לא ניתן לפתוח את תיקיית הלוגים:\n{ex.Message}",
                "Factum IL — שגיאה",
                MessageBoxButton.OK,
                MessageBoxImage.Warning);
        }
    }

    private void ExitButton_Click(object sender, RoutedEventArgs e)
    {
        DialogResult = false;
        Application.Current.Shutdown();
    }
}
