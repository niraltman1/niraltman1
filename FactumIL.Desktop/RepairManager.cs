using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;

namespace FactumIL.Desktop;

/// <summary>State of one component during detection/repair.</summary>
public sealed record RepairItem(string Component, bool Healthy, bool Repairable, string Detail);

public sealed record RepairReport(List<RepairItem> Items)
{
    public bool AllHealthy => Items.All(i => i.Healthy);
}

/// <summary>
/// Self-healing without reinstall (Enhancement 5). Detects missing/broken
/// components — WebView2, Ollama runtime, registered model, database, vector index,
/// corpus and critical configuration — and repairs what it safely can (restart
/// Ollama, re-register the model, rebuild RAG/FTS5 via the existing
/// <c>POST /api/admin/repair/rag</c> endpoint). Issues it cannot auto-fix are
/// reported with guidance. Exposed from <see cref="RecoveryWindow"/> and from the
/// dashboard's Settings → Diagnostics → Repair Installation action.
/// </summary>
public sealed class RepairManager
{
    private readonly OllamaService _ollama;
    private readonly StartupLogger _logger;
    private readonly int _apiPort;

    public RepairManager(OllamaService ollama, StartupLogger logger, int apiPort)
    {
        _ollama  = ollama;
        _logger  = logger;
        _apiPort = apiPort;
    }

    // ── Detection ───────────────────────────────────────────────────────────────

    public async Task<RepairReport> DetectAsync(CancellationToken ct = default)
    {
        var items = new List<RepairItem>();

        // Critical configuration (env vars set by the installer)
        items.Add(CheckConfig());

        // WebView2 (UI prerequisite) — not auto-repairable from here, guided.
        var web = WebView2Present();
        items.Add(new RepairItem("WebView2", web, false,
            web ? "מותקן" : "חסר — הפעל tools\\MicrosoftEdgeWebview2Setup.exe"));

        // Ollama runtime
        var ollamaInstalled = OllamaService.IsOllamaInstalled();
        var ollamaUp = ollamaInstalled && await _ollama.PingPublicAsync();
        items.Add(new RepairItem("Ollama", ollamaUp, ollamaInstalled,
            ollamaInstalled ? (ollamaUp ? "פעיל" : "מותקן אך אינו פועל") : "אינו מותקן"));

        // Registered model
        var modelOk = ollamaUp && await _ollama.IsModelRegisteredAsync();
        items.Add(new RepairItem("AI Model", modelOk, ollamaInstalled,
            modelOk ? "רשום" : "אינו רשום"));

        // Database (critical) + vector index + corpus via health endpoints
        var health = await GetJsonHealthyAsync($"http://localhost:{_apiPort}/api/health", "db", ct);
        items.Add(new RepairItem("Database", health, false, health ? "תקין" : "אינו תקין"));

        var functional = await FunctionalHealthChecks.CheckApiFunctionalAsync(_apiPort, ct);
        items.Add(new RepairItem("Vector Index / Corpus", functional.Healthy, true, functional.Detail));

        _logger.Log("repair", "detect", RepairReportStatus(items),
            extra: new Dictionary<string, object?> { ["unhealthy"] = items.Count(i => !i.Healthy) });

        return new RepairReport(items);
    }

    // ── Repair ──────────────────────────────────────────────────────────────────

    public async Task<RepairReport> RepairAsync(IProgress<string>? progress = null, CancellationToken ct = default)
    {
        var report = await DetectAsync(ct);

        foreach (var item in report.Items.Where(i => !i.Healthy && i.Repairable))
        {
            progress?.Report($"מתקן: {item.Component}…");
            _logger.Log("repair", $"attempt:{item.Component}", LogStatus.Started);

            switch (item.Component)
            {
                case "Ollama":
                    await _ollama.StartAsync();
                    await _ollama.WaitForReadyAsync(ct);
                    break;

                case "AI Model":
                    if (await _ollama.PingPublicAsync())
                        await _ollama.EnsureModelAsync();
                    break;

                case "Vector Index / Corpus":
                    await RepairRagAsync(ct);
                    break;
            }
        }

        // Re-detect to confirm what was fixed.
        var after = await DetectAsync(ct);
        _logger.Log("repair", "complete", after.AllHealthy ? LogStatus.Recovered : LogStatus.Warn,
            error: after.AllHealthy ? null : "some components still degraded");
        return after;
    }

    // ── Helpers ─────────────────────────────────────────────────────────────────

    private async Task RepairRagAsync(CancellationToken ct)
    {
        try
        {
            using var http = new HttpClient { Timeout = TimeSpan.FromMinutes(2) };
            using var content = new StringContent("{}", System.Text.Encoding.UTF8, "application/json");
            await http.PostAsync($"http://localhost:{_apiPort}/api/admin/repair/rag", content, ct);
        }
        catch (Exception ex)
        {
            _logger.Log("repair", "rag", LogStatus.Warn, error: ex.Message);
        }
    }

    private static RepairItem CheckConfig()
    {
        var required = new[] { "FACTUM_IL_ROOT", "OLLAMA_MODEL", "OLLAMA_BASE_URL" };
        var missing  = required.Where(k => string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable(k))).ToList();
        return missing.Count == 0
            ? new RepairItem("Configuration", true, false, "כל משתני הסביבה מוגדרים")
            : new RepairItem("Configuration", false, false, $"חסרים: {string.Join(", ", missing)}");
    }

    private static async Task<bool> GetJsonHealthyAsync(string url, string checkName, CancellationToken ct)
    {
        try
        {
            using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(5) };
            var body = await http.GetStringAsync(url, ct);
            using var doc = System.Text.Json.JsonDocument.Parse(body);
            var root = doc.RootElement;
            return root.TryGetProperty("checks", out var checks)
                && checks.TryGetProperty(checkName, out var check)
                && check.TryGetProperty("healthy", out var healthy)
                && healthy.ValueKind == System.Text.Json.JsonValueKind.True;
        }
        catch { return false; }
    }

    private static bool WebView2Present()
    {
        try
        {
            const string key = @"SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}";
            using var hklm = Microsoft.Win32.Registry.LocalMachine.OpenSubKey(key);
            var pv = hklm?.GetValue("pv") as string;
            return !string.IsNullOrEmpty(pv) && pv != "0.0.0.0";
        }
        catch { return false; }
    }

    private static LogStatus RepairReportStatus(IEnumerable<RepairItem> items) =>
        items.All(i => i.Healthy) ? LogStatus.Ok : LogStatus.Warn;
}
