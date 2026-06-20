using System.Threading;
using System.Threading.Tasks;

namespace FactumIL.Desktop;

/// <summary>
/// Tunable parameters for <see cref="RetryPolicy"/>.
/// Every retry loop is bounded by both <see cref="MaxAttempts"/> and the optional
/// <see cref="OverallTimeout"/> — there are no infinite loops and no "wait forever".
/// </summary>
public sealed record RetryOptions
{
    /// <summary>Maximum number of attempts (always &gt;= 1).</summary>
    public int MaxAttempts { get; init; } = 5;

    /// <summary>Delay before the second attempt; grows by <see cref="BackoffFactor"/>.</summary>
    public TimeSpan InitialDelay { get; init; } = TimeSpan.FromSeconds(1);

    /// <summary>Upper bound on the backoff delay between attempts.</summary>
    public TimeSpan MaxDelay { get; init; } = TimeSpan.FromSeconds(15);

    /// <summary>Multiplier applied to the delay after each failed attempt.</summary>
    public double BackoffFactor { get; init; } = 2.0;

    /// <summary>Optional hard ceiling on the total time spent across all attempts.</summary>
    public TimeSpan? OverallTimeout { get; init; }

    /// <summary>Human-readable name used in log + progress messages.</summary>
    public string Operation { get; init; } = "operation";
}

/// <summary>
/// Reusable async retry helper with exponential backoff, a configurable overall
/// timeout, cancellation, structured logging, and user-visible progress messages.
/// Used by <see cref="BootstrapManager"/> and <see cref="OllamaService"/> so that
/// every wait in the startup pipeline is bounded and observable.
/// </summary>
public static class RetryPolicy
{
    /// <summary>
    /// Runs <paramref name="action"/> until it returns <c>true</c>, the attempt
    /// budget is exhausted, or the overall timeout/cancellation fires.
    /// Returns <c>true</c> on success, <c>false</c> otherwise. Never throws.
    /// </summary>
    public static async Task<bool> RunAsync(
        Func<CancellationToken, Task<bool>> action,
        RetryOptions options,
        Action<string>? log = null,
        IProgress<string>? progress = null,
        Action<int>? onAttempt = null,
        CancellationToken ct = default)
    {
        using var timeoutCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        if (options.OverallTimeout is { } overall)
            timeoutCts.CancelAfter(overall);
        var token = timeoutCts.Token;

        var attempts = Math.Max(1, options.MaxAttempts);
        var delay    = options.InitialDelay;

        for (var attempt = 1; attempt <= attempts; attempt++)
        {
            if (token.IsCancellationRequested)
            {
                log?.Invoke($"{options.Operation}: cancelled/timed-out before attempt {attempt}");
                return false;
            }

            try
            {
                onAttempt?.Invoke(attempt);
                progress?.Report($"{options.Operation} (ניסיון {attempt}/{attempts})…");
                if (await action(token).ConfigureAwait(false))
                {
                    log?.Invoke($"{options.Operation}: success on attempt {attempt}/{attempts}");
                    return true;
                }
                log?.Invoke($"{options.Operation}: attempt {attempt}/{attempts} returned not-ready");
            }
            catch (OperationCanceledException)
            {
                log?.Invoke($"{options.Operation}: cancelled/timed-out on attempt {attempt}");
                return false;
            }
            catch (Exception ex)
            {
                log?.Invoke($"{options.Operation}: attempt {attempt}/{attempts} threw {ex.GetType().Name}: {ex.Message}");
            }

            if (attempt < attempts)
            {
                try { await Task.Delay(delay, token).ConfigureAwait(false); }
                catch (OperationCanceledException)
                {
                    log?.Invoke($"{options.Operation}: cancelled/timed-out during backoff");
                    return false;
                }

                var nextMs = Math.Min(
                    delay.TotalMilliseconds * options.BackoffFactor,
                    options.MaxDelay.TotalMilliseconds);
                delay = TimeSpan.FromMilliseconds(nextMs);
            }
        }

        log?.Invoke($"{options.Operation}: exhausted {attempts} attempts without success");
        return false;
    }
}
