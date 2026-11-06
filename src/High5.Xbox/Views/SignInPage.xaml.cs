using System.ComponentModel;
using System.Threading;
using High5.Core.ViewModels;
using Windows.UI.Xaml;
using Windows.UI.Xaml.Controls;
using Windows.UI.Xaml.Navigation;

namespace High5.Xbox.Views
{
    public sealed partial class SignInPage : Page
    {
        public SignInViewModel Vm { get; } = new SignInViewModel(App.Services.Auth);
        private CancellationTokenSource _cts;

        public SignInPage()
        {
            InitializeComponent();
            Vm.PropertyChanged += OnVmChanged;
        }

        protected override async void OnNavigatedTo(NavigationEventArgs e) => await StartAsync();
        protected override void OnNavigatedFrom(NavigationEventArgs e) => _cts?.Cancel();   // stop polling when leaving

        private async System.Threading.Tasks.Task StartAsync()
        {
            _cts?.Cancel(); _cts = new CancellationTokenSource();
            Retry.Visibility = Visibility.Collapsed;
            await Vm.RunAsync(_cts.Token);
        }

        private void OnVmChanged(object s, PropertyChangedEventArgs a)
        {
            if (a.PropertyName == nameof(Vm.IsSignedIn) && Vm.IsSignedIn) { Frame.Navigate(typeof(HomePage)); Frame.BackStack.Clear(); }
            if (a.PropertyName == nameof(Vm.IsExpired) && Vm.IsExpired) { Retry.Visibility = Visibility.Visible; Retry.Focus(FocusState.Programmatic); }
        }

        private async void OnRetry(object s, RoutedEventArgs e) => await StartAsync();
    }
}
