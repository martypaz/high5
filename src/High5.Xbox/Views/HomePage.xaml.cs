using High5.Core.Models;
using High5.Core.ViewModels;
using Windows.UI.Xaml;
using Windows.UI.Xaml.Controls;
using Windows.UI.Xaml.Navigation;

namespace High5.Xbox.Views
{
    public sealed partial class HomePage : Page
    {
        public HomeViewModel Vm { get; } = new HomeViewModel(App.Services.Catalogue, App.Services.Resume, App.Services.Parental);
        public Visibility HasResume => Vm.ContinueWatching.Count > 0 ? Visibility.Visible : Visibility.Collapsed;

        public HomePage() { InitializeComponent(); NavigationCacheMode = NavigationCacheMode.Required; }

        protected override async void OnNavigatedTo(NavigationEventArgs e)
        {
            await Vm.LoadAsync();             // reload so Continue watching reflects what was just played
            Bindings.Update();
        }

        private void OnTileClick(object s, ItemClickEventArgs e) => Frame.Navigate(typeof(ShowPage), ((ContentItem)e.ClickedItem).Id);
        private void OnResumeClick(object s, ItemClickEventArgs e) => Frame.Navigate(typeof(PlayerPage), ((ResumeCard)e.ClickedItem).Episode.Id);
    }
}
