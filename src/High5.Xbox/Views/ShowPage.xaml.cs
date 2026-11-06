using High5.Core.Models;
using High5.Core.ViewModels;
using Windows.UI.Xaml;
using Windows.UI.Xaml.Controls;
using Windows.UI.Xaml.Navigation;

namespace High5.Xbox.Views
{
    public sealed partial class ShowPage : Page
    {
        public ShowDetailViewModel Vm { get; } = new ShowDetailViewModel(App.Services.Catalogue, App.Services.MyList, App.Services.Resume);
        public string MyListLabel => Vm.InMyList ? "Remove from My List" : "Add to My List";

        public ShowPage()
        {
            InitializeComponent();
            Vm.PropertyChanged += (s, e) => Bindings.Update();
        }

        protected override async void OnNavigatedTo(NavigationEventArgs e)
        {
            await Vm.LoadAsync((string)e.Parameter);
            PlayButton.Focus(FocusState.Programmatic);   // gamepad users land on the main action
        }

        private void OnPlay(object s, RoutedEventArgs e) { if (Vm.NextToWatch != null) Frame.Navigate(typeof(PlayerPage), Vm.NextToWatch.Id); }
        private void OnEpisode(object s, ItemClickEventArgs e) => Frame.Navigate(typeof(PlayerPage), ((Episode)e.ClickedItem).Id);
    }
}
