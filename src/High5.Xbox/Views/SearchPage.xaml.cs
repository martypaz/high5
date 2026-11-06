using High5.Core.Models;
using High5.Core.ViewModels;
using Windows.UI.Xaml.Controls;

namespace High5.Xbox.Views
{
    public sealed partial class SearchPage : Page
    {
        public SearchViewModel Vm { get; } = new SearchViewModel(App.Services.Catalogue, App.Services.Parental);
        public SearchPage() { InitializeComponent(); }
        private async void OnText(AutoSuggestBox s, AutoSuggestBoxTextChangedEventArgs a)
        { if (a.Reason == AutoSuggestionBoxTextChangeReason.UserInput) await Vm.SearchAsync(s.Text); }
        private async void OnQuery(AutoSuggestBox s, AutoSuggestBoxQuerySubmittedEventArgs a) => await Vm.SearchAsync(a.QueryText);
        private void OnTile(object s, ItemClickEventArgs e) => Frame.Navigate(typeof(ShowPage), ((ContentItem)e.ClickedItem).Id);
    }
}
