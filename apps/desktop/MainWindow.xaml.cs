using System;
using System.Diagnostics;
using System.IO;
using System.Net.Http;
using System.Runtime.InteropServices;
using System.Threading.Tasks;
using System.Windows;
using Microsoft.Web.WebView2.Core;

namespace FactumIL.Desktop;

public partial class MainWindow : Window
{
    private Process?                    _apiProcess;
    private IntPtr                      _jobHandle = IntPtr.Zero;
    private static readonly HttpClient _proxy = new();
    private const string BaseUrl           = "http://localhost:3001";
    private const string UiUrl             = "http://localhost:3001";
    private const int    ApiTimeoutSeconds  = 25;

    public MainWindow()
    {
        InitializeComponent();
        Loaded += async (_, _) => await BootAsync();
        Closed += (_, _) => Cleanup();
    }

    // ─────────────────────────────────────────────
    //  Boot sequence
    // ─────────────────────────────────────────────

    private async Task BootAsync()
    {
        SetStatus("מפעיל את מנוע Factum IL...");
        if (!await StartApiServerAsync()) return;

        SetStatus("מחבר לבסיס הנתונים המאובטח...");
        try
        {
            await WaitForApiAsync();
        }
        catch (TimeoutException)
        {
            MessageBox.Show(
                "שרת ה-API לא הגיב תוך 25 שניות.\nנסה להפעיל את Factum IL שנית.",
                "שגיאת אתחול", MessageBoxButton.OK, MessageBoxImage.Warning);
            Application.Current.Shutdown();
            return;
        }

        SetStatus("טוען ממשק...");
        await InitializeWebViewAsync();
    }

    // ─────────────────────────────────────────────
    //  Start Node.js API process
    // ─────────────────────────────────────────────

    private async Task<bool> StartApiServerAsync()
    {
        // If API is already running (dev mode), skip starting a bundled process
        using (var probe = new HttpClient { Timeout = TimeSpan.FromSeconds(2) })
        {
            try
            {
                var r = await probe.GetAsync($"{BaseUrl}/api/health");
                if (r.IsSuccessStatusCode) { SetStatus("שרת API פעיל"); return true; }
            }
            catch { }
        }

        // ── Safeguard 2: Kill only our bundled node.exe instances ─────────────
        KillStaleProcesses();

        string baseDir   = AppDomain.CurrentDomain.BaseDirectory;
        string appRoot   = Path.GetFullPath(Path.Combine(baseDir, ".."));
        string nodeExe   = Path.Combine(appRoot, "runtime",  "node.exe");
        string apiJsPath = Path.Combine(appRoot, "backend",  "dist", "start.js");

        if (!File.Exists(nodeExe) || !File.Exists(apiJsPath))
        {
            MessageBox.Show(
                $"לא נמצאו קבצי זמן ריצה:\n{nodeExe}\n{apiJsPath}\n\nהפעל 'publish.ps1' תחילה.",
                "שגיאה קריטית", MessageBoxButton.OK, MessageBoxImage.Error);
            Application.Current.Shutdown();
            return false;
        }

        // ── Safeguard 1: Write DB to %LOCALAPPDATA%\FactumIL — writable even ──
        // ── without UAC elevation, safe under C:\Program Files install root  ──
        string localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        string dbDir        = Path.Combine(localAppData, "FactumIL");
        Directory.CreateDirectory(dbDir);

        var psi = new ProcessStartInfo
        {
            FileName         = nodeExe,
            Arguments        = $"\"{apiJsPath}\"",
            WorkingDirectory = Path.GetDirectoryName(apiJsPath),
            UseShellExecute  = false,
            CreateNoWindow   = true,
            WindowStyle      = ProcessWindowStyle.Hidden,
            RedirectStandardOutput = true,
            RedirectStandardError  = true,
        };
        psi.Environment["NODE_ENV"]          = "production";
        psi.Environment["FACTUM_IL_ROOT"]     = appRoot;
        psi.Environment["FACTUM_IL_DB_PATH"]  = Path.Combine(dbDir, "factum-il.db");

        _apiProcess = new Process { StartInfo = psi };
        _apiProcess.OutputDataReceived += (_, e) => Debug.WriteLine(e.Data);
        _apiProcess.ErrorDataReceived  += (_, e) => Debug.WriteLine("ERR: " + e.Data);
        _apiProcess.Start();
        _apiProcess.BeginOutputReadLine();
        _apiProcess.BeginErrorReadLine();

        // ── Safeguard 3: Bind Node to WPF process via Win32 Job Object ────────
        EnsureJobObjectBound(_apiProcess);

        await Task.CompletedTask;
        return true;
    }

    // ─────────────────────────────────────────────
    //  Poll until API responds (max ApiTimeoutSeconds)
    // ─────────────────────────────────────────────

    private async Task WaitForApiAsync()
    {
        using var http     = new HttpClient { Timeout = TimeSpan.FromSeconds(2) };
        var       deadline = DateTime.UtcNow.AddSeconds(ApiTimeoutSeconds);

        while (DateTime.UtcNow < deadline)
        {
            try
            {
                var resp = await http.GetAsync($"{BaseUrl}/api/health");
                if (resp.IsSuccessStatusCode) return;
            }
            catch { }

            await Task.Delay(1000);
        }

        throw new TimeoutException("API server did not respond within timeout");
    }

    // ─────────────────────────────────────────────
    //  Initialize WebView2 and navigate
    // ─────────────────────────────────────────────

    private async Task InitializeWebViewAsync()
    {
        await webView.EnsureCoreWebView2Async(null);

        var s = webView.CoreWebView2.Settings;
        s.AreDevToolsEnabled            = Debugger.IsAttached;
        s.IsStatusBarEnabled            = false;
        s.IsZoomControlEnabled          = true;
        s.AreDefaultContextMenusEnabled = true;

        webView.CoreWebView2.Navigate(UiUrl);
        RegisterApiProxy();
        webView.CoreWebView2.WebMessageReceived += OnWebMessageReceived;

        webView.Visibility     = Visibility.Visible;
        loadingGrid.Visibility = Visibility.Collapsed;
    }

    // ─────────────────────────────────────────────
    //  Native folder picker — triggered by JS postMessage
    // ─────────────────────────────────────────────

    private void OnWebMessageReceived(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        var msg = e.TryGetWebMessageAsString();
        if (msg != "openFolderPicker") return;

        Dispatcher.Invoke(() =>
        {
            var dlg = new Microsoft.Win32.OpenFolderDialog
            {
                Title       = "בחר תיקייה לסריקה ולארגון",
                Multiselect = false,
            };
            var selected = dlg.ShowDialog() == true ? dlg.FolderName : "";
            webView.CoreWebView2.PostWebMessageAsString(selected);
        });
    }

    // ─────────────────────────────────────────────
    //  API proxy bridge — intercepts /api/* in WebView2
    //  and forwards to Express on :3001.
    //  No-op in production (filter only matches localhost:5173).
    // ─────────────────────────────────────────────

    private void RegisterApiProxy()
    {
        webView.CoreWebView2.AddWebResourceRequestedFilter(
            "http://localhost:5173/api/*",
            CoreWebView2WebResourceContext.All);
        webView.CoreWebView2.WebResourceRequested += OnApiProxyRequest;
    }

    private void OnApiProxyRequest(object? sender, CoreWebView2WebResourceRequestedEventArgs e)
    {
        var deferral = e.GetDeferral();
        _ = ProxyRequestAsync(e, deferral);
    }

    private async Task ProxyRequestAsync(CoreWebView2WebResourceRequestedEventArgs e, CoreWebView2Deferral deferral)
    {
        try
        {
            var targetUri = e.Request.Uri.Replace("http://localhost:5173", "http://localhost:3001");
            var req = new HttpRequestMessage(new HttpMethod(e.Request.Method), targetUri);

            foreach (var h in e.Request.Headers)
            {
                if (!string.Equals(h.Key, "Host", StringComparison.OrdinalIgnoreCase))
                    req.Headers.TryAddWithoutValidation(h.Key, h.Value);
            }

            if (e.Request.Content is Stream body && body.CanRead)
            {
                var ms = new MemoryStream();
                await body.CopyToAsync(ms);
                ms.Position = 0;
                req.Content = new StreamContent(ms);
                foreach (var h in e.Request.Headers)
                {
                    if (h.Key.StartsWith("Content-", StringComparison.OrdinalIgnoreCase))
                        req.Content.Headers.TryAddWithoutValidation(h.Key, h.Value);
                }
            }

            var resp  = await _proxy.SendAsync(req);
            var bytes = await resp.Content.ReadAsByteArrayAsync();

            var hdrSb = new System.Text.StringBuilder();
            foreach (var h in resp.Headers)
                hdrSb.AppendLine($"{h.Key}: {string.Join(", ", h.Value)}");
            foreach (var h in resp.Content.Headers)
                hdrSb.AppendLine($"{h.Key}: {string.Join(", ", h.Value)}");

            e.Response = webView.CoreWebView2.Environment.CreateWebResourceResponse(
                new MemoryStream(bytes),
                (int)resp.StatusCode,
                resp.ReasonPhrase ?? "OK",
                hdrSb.ToString().TrimEnd());
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[Proxy Engine Error] {ex.Message}");
            e.Response = webView.CoreWebView2.Environment.CreateWebResourceResponse(
                new MemoryStream(), 502, "Bad Gateway",
                "Content-Type: text/plain\r\nAccess-Control-Allow-Origin: *");
        }
        finally
        {
            deferral.Complete();
        }
    }

    // ─────────────────────────────────────────────
    //  Helpers
    // ─────────────────────────────────────────────

    private void SetStatus(string msg) =>
        Dispatcher.Invoke(() => loadingStatus.Text = msg);

    private void Cleanup()
    {
        try { _apiProcess?.Kill(entireProcessTree: true); _apiProcess?.Dispose(); } catch { }
        try { if (_jobHandle != IntPtr.Zero) CloseHandle(_jobHandle); } catch { }
    }

    // ─────────────────────────────────────────────
    //  Safeguard 2 — Kill only our bundled node.exe
    // ─────────────────────────────────────────────

    private static void KillStaleProcesses()
    {
        string baseDir   = AppDomain.CurrentDomain.BaseDirectory;
        string appRoot   = Path.GetFullPath(Path.Combine(baseDir, ".."));
        string targetExe = Path.GetFullPath(Path.Combine(appRoot, "runtime", "node.exe"));

        foreach (var p in Process.GetProcessesByName("node"))
        {
            try
            {
                // Only kill processes running from our own embedded runtime directory
                if (p.MainModule?.FileName is string exePath &&
                    string.Equals(Path.GetFullPath(exePath), targetExe, StringComparison.OrdinalIgnoreCase))
                {
                    p.Kill(entireProcessTree: true);
                }
            }
            catch { /* Access denied on protected processes is expected; silently skip */ }
            finally { p.Dispose(); }
        }
    }

    // ─────────────────────────────────────────────
    //  Safeguard 3 — Win32 Job Object
    //  Kernel-level guarantee: Node is killed even if
    //  WPF crashes or is force-closed via Task Manager.
    // ─────────────────────────────────────────────

    private void EnsureJobObjectBound(Process process)
    {
        try
        {
            _jobHandle = CreateJobObject(IntPtr.Zero, null);
            if (_jobHandle == IntPtr.Zero) return;

            var info = new JOBOBJECT_EXTENDED_LIMIT_INFORMATION();
            info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;

            int    length  = Marshal.SizeOf(typeof(JOBOBJECT_EXTENDED_LIMIT_INFORMATION));
            IntPtr infoPtr = Marshal.AllocHGlobal(length);
            try
            {
                Marshal.StructureToPtr(info, infoPtr, false);
                SetInformationJobObject(_jobHandle, JobObjectExtendedLimitInformation, infoPtr, (uint)length);
            }
            finally { Marshal.FreeHGlobal(infoPtr); }

            AssignProcessToJobObject(_jobHandle, process.Handle);
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[JobObject] Failed to bind: {ex.Message}");
        }
    }

    // ── P/Invoke ──────────────────────────────────────────────────────────────

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern IntPtr CreateJobObject(IntPtr lpJobAttributes, string? lpName);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool SetInformationJobObject(IntPtr hJob, int jobObjectInfoClass,
        IntPtr lpJobObjectInfo, uint cbJobObjectInfoLength);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool AssignProcessToJobObject(IntPtr hJob, IntPtr hProcess);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool CloseHandle(IntPtr hObject);

    private const uint JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x00002000;
    private const int  JobObjectExtendedLimitInformation   = 9;

    [StructLayout(LayoutKind.Sequential)]
    private struct JOBOBJECT_BASIC_LIMIT_INFORMATION
    {
        public long    PerProcessUserTimeLimit;
        public long    PerJobUserTimeLimit;
        public uint    LimitFlags;
        public UIntPtr MinimumWorkingSetSize;
        public UIntPtr MaximumWorkingSetSize;
        public uint    ActiveProcessLimit;
        public UIntPtr Affinity;
        public uint    PriorityClass;
        public uint    SchedulingClass;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct IO_COUNTERS
    {
        public ulong ReadOperationCount;
        public ulong WriteOperationCount;
        public ulong OtherOperationCount;
        public ulong ReadTransferCount;
        public ulong WriteTransferCount;
        public ulong OtherTransferCount;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct JOBOBJECT_EXTENDED_LIMIT_INFORMATION
    {
        public JOBOBJECT_BASIC_LIMIT_INFORMATION BasicLimitInformation;
        public IO_COUNTERS                       IoCounters;
        public UIntPtr                           ProcessMemoryLimit;
        public UIntPtr                           JobMemoryLimit;
        public UIntPtr                           PeakProcessMemoryLimit;
        public UIntPtr                           PeakJobMemoryLimit;
    }
}
