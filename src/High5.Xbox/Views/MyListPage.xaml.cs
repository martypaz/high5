using High5.Core.Models;
using High5.Core.ViewModels;
using Windows.UI.Xaml.Controls;
using Windows.UI.Xaml.Navigation;

namespace High5.Xbox.Views
{
    public sealed partial class MyListPage : Page
    {
        public MyListViewModel Vm { get; } = new MyListViewModel(App.Services.MyList, App.Services.Parental);
        public MyListPage() { InitializeComponent(); }
        protected override async void OnNavigatedTo(NavigationEventArgs e) => await Vm.LoadAsync();
        private void OnTile(object s, ItemClickEventArgs e) => Frame.Navigate(typeof(ShowPage), ((ContentItem)e.ClickedItem).Id);
    }
}
