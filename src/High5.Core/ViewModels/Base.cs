using System;
using System.ComponentModel;
using System.Runtime.CompilerServices;
using System.Threading.Tasks;
using System.Windows.Input;

namespace High5.Core.ViewModels
{
    public abstract class ObservableObject : INotifyPropertyChanged
    {
        public event PropertyChangedEventHandler? PropertyChanged;

        protected bool Set<T>(ref T field, T value, [CallerMemberName] string? name = null)
        {
            if (Equals(field, value)) return false;
            field = value;
            PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));
            return true;
        }

        protected void Raise([CallerMemberName] string? name = null) =>
            PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));
    }

    /// <summary>Async command that ignores re-entrant invocations and surfaces errors to the view-model.</summary>
    public sealed class AsyncCommand : ICommand
    {
        private readonly Func<object?, Task> _run;
        private readonly Func<object?, bool>? _can;
        private bool _running;
        public event EventHandler? CanExecuteChanged;

        public AsyncCommand(Func<object?, Task> run, Func<object?, bool>? can = null) { _run = run; _can = can; }
        public AsyncCommand(Func<Task> run) : this(_ => run()) { }

        public bool CanExecute(object? parameter) => !_running && (_can?.Invoke(parameter) ?? true);

        public async void Execute(object? parameter)
        {
            if (!CanExecute(parameter)) return;
            _running = true; CanExecuteChanged?.Invoke(this, EventArgs.Empty);
            try { await _run(parameter).ConfigureAwait(true); }
            finally { _running = false; CanExecuteChanged?.Invoke(this, EventArgs.Empty); }
        }
    }

    public abstract class ScreenViewModel : ObservableObject
    {
        private bool _isLoading;
        private string? _error;
        public bool IsLoading { get => _isLoading; protected set => Set(ref _isLoading, value); }
        public string? Error { get => _error; protected set => Set(ref _error, value); }

        protected async Task RunAsync(Func<Task> work)
        {
            IsLoading = true; Error = null;
            try { await work().ConfigureAwait(true); }
            catch (OperationCanceledException) { }
            catch (Exception ex) { Error = ex.Message; }
            finally { IsLoading = false; }
        }
    }
}
