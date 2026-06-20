using System.Collections.Generic;

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
/// Authoritative single source of truth (R1) for the Ollama runtime + model state.
/// <see cref="BootstrapManager"/> and <see cref="SafeModeManager"/> read state through
/// here rather than keeping independent flags. Transitions are validated against a
/// legal-transition table; an illegal transition is logged and ignored. The legal
/// graph is documented in <c>INSTALLER_ORCHESTRATION_SPEC.md</c> §2.
/// </summary>
public sealed class OllamaLifecycle
{
    private readonly object _gate = new();
    private readonly Action<string, string>? _onTransition; // (field, newState)
    private readonly Action<string>?          _onIllegal;    // (message)

    private OllamaRuntimeState _runtime = OllamaRuntimeState.NotInstalled;
    private OllamaModelState   _model   = OllamaModelState.NotFound;

    // Legal transitions (permissive but explicit). Any state may go to Failed; Failed
    // may recover. Same-state writes are no-ops.
    private static readonly Dictionary<OllamaRuntimeState, HashSet<OllamaRuntimeState>> _runtimeLegal = new()
    {
        [OllamaRuntimeState.NotInstalled] = new() { OllamaRuntimeState.Installing, OllamaRuntimeState.Installed, OllamaRuntimeState.Starting, OllamaRuntimeState.Ready, OllamaRuntimeState.Failed },
        [OllamaRuntimeState.Installing]   = new() { OllamaRuntimeState.Installed, OllamaRuntimeState.Failed },
        [OllamaRuntimeState.Installed]    = new() { OllamaRuntimeState.Starting, OllamaRuntimeState.Ready, OllamaRuntimeState.NotInstalled, OllamaRuntimeState.Failed },
        [OllamaRuntimeState.Starting]     = new() { OllamaRuntimeState.Ready, OllamaRuntimeState.Failed },
        [OllamaRuntimeState.Ready]        = new() { OllamaRuntimeState.Starting, OllamaRuntimeState.Failed },
        [OllamaRuntimeState.Failed]       = new() { OllamaRuntimeState.Starting, OllamaRuntimeState.Ready, OllamaRuntimeState.Installed, OllamaRuntimeState.NotInstalled },
    };

    private static readonly Dictionary<OllamaModelState, HashSet<OllamaModelState>> _modelLegal = new()
    {
        [OllamaModelState.NotFound]    = new() { OllamaModelState.Registering, OllamaModelState.Ready, OllamaModelState.Failed },
        [OllamaModelState.Registering] = new() { OllamaModelState.Ready, OllamaModelState.Failed },
        [OllamaModelState.Ready]       = new() { OllamaModelState.Registering, OllamaModelState.Failed },
        [OllamaModelState.Failed]      = new() { OllamaModelState.Registering, OllamaModelState.Ready, OllamaModelState.NotFound },
    };

    public OllamaLifecycle(Action<string, string>? onTransition = null, Action<string>? onIllegal = null)
    {
        _onTransition = onTransition;
        _onIllegal    = onIllegal;
    }

    public OllamaRuntimeState Runtime { get { lock (_gate) return _runtime; } }
    public OllamaModelState   Model   { get { lock (_gate) return _model; } }

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
            if (_runtime == state) return;
            if (!_runtimeLegal.TryGetValue(_runtime, out var allowed) || !allowed.Contains(state))
            {
                _onIllegal?.Invoke($"runtime {_runtime}->{state}");
                return; // illegal — logged + ignored
            }
            _runtime = state;
            changed = true;
        }
        if (changed) _onTransition?.Invoke("runtime", state.ToString());
    }

    public void SetModel(OllamaModelState state)
    {
        bool changed;
        lock (_gate)
        {
            if (_model == state) return;
            if (!_modelLegal.TryGetValue(_model, out var allowed) || !allowed.Contains(state))
            {
                _onIllegal?.Invoke($"model {_model}->{state}");
                return;
            }
            _model = state;
            changed = true;
        }
        if (changed) _onTransition?.Invoke("model", state.ToString());
    }

    public override string ToString()
    {
        lock (_gate) return $"runtime={_runtime}, model={_model}";
    }
}
