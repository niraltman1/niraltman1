namespace FactumIL.Desktop;

/// <summary>
/// Coordinates degraded ("safe") operation when AI infrastructure is unavailable
/// (Enhancement 2). In safe mode the app stays fully usable for non-AI work —
/// case/document management, database access, local search, UI navigation — while
/// RAG, AI chat, embeddings and model inference are disabled. Failure of the AI
/// stack therefore degrades the app instead of shutting it down.
///
/// This is a coordinator, not the enforcer: the Node API already disables
/// AI-backed background workers when started with <c>FACTUM_IL_SAFE_MODE=1</c>
/// (see <see cref="ApiHostService.Start"/>), and the dashboard reacts to
/// <c>/api/health</c> <c>ai_ready=false</c>. Subscribers (App / MainWindow) react
/// to <see cref="SafeModeChanged"/> to restart the API in safe mode and surface a
/// user notification. <see cref="OllamaSupervisor"/> keeps retrying in the
/// background and calls <see cref="Exit"/> for a seamless return to normal mode.
/// </summary>
public sealed class SafeModeManager
{
    public static SafeModeManager Instance { get; } = new();

    private readonly StartupLogger _logger = new();
    private readonly object _gate = new();

    public bool    IsActive { get; private set; }
    public string? Reason   { get; private set; }

    /// <summary>Raised when safe mode is entered (true) or left (false).</summary>
    public event Action<bool, string?>? SafeModeChanged;

    private SafeModeManager() { }

    /// <summary>Enters safe mode. No-op (idempotent) if already active.</summary>
    public void Enter(string reason)
    {
        lock (_gate)
        {
            if (IsActive) return;
            IsActive = true;
            Reason   = reason;
        }
        _logger.Log("safe-mode", "enter", LogStatus.Warn, error: reason);
        SafeModeChanged?.Invoke(true, reason);
    }

    /// <summary>Leaves safe mode and returns to normal operation. No-op if inactive.</summary>
    public void Exit()
    {
        lock (_gate)
        {
            if (!IsActive) return;
            IsActive = false;
            Reason   = null;
        }
        _logger.Log("safe-mode", "exit", LogStatus.Recovered);
        SafeModeChanged?.Invoke(false, null);
    }
}
