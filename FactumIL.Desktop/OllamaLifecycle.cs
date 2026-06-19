namespace FactumIL.Desktop;

/// <summary>
/// Deterministic states for the Ollama <b>runtime</b> (the server process + HTTP API).
/// No component may treat Ollama as usable unless the tracked state is
/// <see cref="Ready"/>, and <see cref="Ready"/> is only set after a verified ping.
/// </summary>
public enum OllamaRuntimeState
{
    NotInstalled,
    Installing,
    Installed,
    Starting,
    Ready,
    Failed,
}

/// <summary>
/// Deterministic states for the required <b>model</b> inside Ollama.
/// </summary>
public enum OllamaModelState
{
    NotFound,
    Registering,
    Ready,
    Failed,
}

/// <summary>
/// Tracks the explicit lifecycle state of the Ollama runtime and its model.
/// Transitions are logged (via the optional callback) so the deployment pipeline
/// is observable end-to-end. Thread-safe for the simple read/write pattern used
/// by <see cref="OllamaService"/> and <see cref="OllamaSupervisor"/>.
/// </summary>
public sealed class OllamaLifecycle
{
    private readonly object _gate = new();
    private readonly Action<string, string>? _onTransition; // (field, newState)

    private OllamaRuntimeState _runtime = OllamaRuntimeState.NotInstalled;
    private OllamaModelState   _model   = OllamaModelState.NotFound;

    public OllamaLifecycle(Action<string, string>? onTransition = null)
    {
        _onTransition = onTransition;
    }

    public OllamaRuntimeState Runtime
    {
        get { lock (_gate) return _runtime; }
    }

    public OllamaModelState Model
    {
        get { lock (_gate) return _model; }
    }

    /// <summary>True only when both the runtime and the model are verified ready.</summary>
    public bool IsFullyReady
    {
        get { lock (_gate) return _runtime == OllamaRuntimeState.Ready && _model == OllamaModelState.Ready; }
    }

    public void SetRuntime(OllamaRuntimeState state)
    {
        bool changed;
        lock (_gate)
        {
            changed = _runtime != state;
            _runtime = state;
        }
        if (changed) _onTransition?.Invoke("runtime", state.ToString());
    }

    public void SetModel(OllamaModelState state)
    {
        bool changed;
        lock (_gate)
        {
            changed = _model != state;
            _model = state;
        }
        if (changed) _onTransition?.Invoke("model", state.ToString());
    }

    public override string ToString()
    {
        lock (_gate) return $"runtime={_runtime}, model={_model}";
    }
}
