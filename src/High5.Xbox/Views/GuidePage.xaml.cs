using System;
using High5.Core.ViewModels;
using Windows.UI.Xaml.Controls;
using Windows.UI.Xaml.Navigation;

namespace High5.Xbox.Views
{
    public sealed partial class GuidePage : Page
    {
        public TvGuideViewModel Vm { get; } = new TvGuideViewModel(App.Services.Live, App.Services.Clock);
        public GuidePage() { InitializeComponent(); }
        protected override async void OnNavigatedTo(NavigationEventArgs e) => await Vm.LoadAsync(TimeSpan.FromHours(6));
        private void OnRow(object s, ItemClickEventArgs e) => Frame.Navigate(typeof(PlayerPage), "live:" + ((GuideRow)e.ClickedItem).Channel.Id);
    }
}
