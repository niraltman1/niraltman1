using System.IO;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace FactumIL.Desktop;

/// <summary>Result of a single functional (operational) health probe.</summary>
public sealed record FunctionalCheckResult(bool Healthy, string Detail);

/// <summary>
/// Functional health verification (Enhancement 3): proves a component is
/// <i>operational</i>, not merely that a process responded.
/// <list type="bullet">
///   <item>The deep API endpoint (<c>GET /api/health/functional</c>) exercises the
///   database, vector store, corpus and embeddings with real operations.</item>
///   <item>This class adds a lightweight <b>model inference</b> probe against Ollama
///   (<c>POST /api/generate</c>) which lives outside the Node API.</item>
/// </list>
/// All probes are non-throwing and time-bounded.
/// </summary>
public static class FunctionalHealthChecks
{
    private const string OllamaBase = "http://localhost:11434";

    /// <summary>
    /// Calls the deep API functional endpoint. Returns healthy only when the
    /// endpoint reports <c>ok: true</c> (all critical functional checks passed).
    /// </summary>
    public static async Task<FunctionalCheckResult> CheckApiFunctionalAsync(int port, CancellationToken ct = default)
    {
        try
        {
            using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(20) };
            var res = await http.GetAsync($"http://localhost:{port}/api/health/functional", ct);
            var body = await res.Content.ReadAsStringAsync(ct);

            if (!res.IsSuccessStatusCode)
                return new FunctionalCheckResult(false, $"http {(int)res.StatusCode}");

            using var doc = JsonDocument.Parse(body);
            var ok = doc.RootElement.TryGetProperty("ok", out var okEl) && okEl.ValueKind == JsonValueKind.True;
            return new FunctionalCheckResult(ok, ok ? "functional checks passed" : "one or more functional checks failed");
        }
        catch (Exception ex)
        {
            return new FunctionalCheckResult(false, ex.Message);
        }
    }

    /// <summary>
    /// Runs a minimal inference against the required model to prove it can actually
    /// produce output (catches "model present but unloadable/corrupt" states).
    /// </summary>
    public static async Task<FunctionalCheckResult> CheckModelInferenceAsync(CancellationToken ct = default)
    {
        try
        {
            var body = JsonSerializer.Serialize(new
            {
                model  = OllamaService.RequiredModel,
                prompt = "בדיקה",
                stream = false,
                options = new { num_predict = 1 },
            });
            using var content = new StringContent(body, Encoding.UTF8, "application/json");
            using var http    = new HttpClient { Timeout = TimeSpan.FromSeconds(30) };

            var res = await http.PostAsync($"{OllamaBase}/api/generate", content, ct);
            if (!res.IsSuccessStatusCode)
                return new FunctionalCheckResult(false, $"http {(int)res.StatusCode}");

            var json = await res.Content.ReadAsStringAsync(ct);
            using var doc = JsonDocument.Parse(json);
            var hasResponse = doc.RootElement.TryGetProperty("response", out _);
            return new FunctionalCheckResult(hasResponse, hasResponse ? "inference ok" : "no response field");
        }
        catch (Exception ex)
        {
            return new FunctionalCheckResult(false, ex.Message);
        }
    }
}
