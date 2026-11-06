using System;
using Windows.UI.Xaml.Controls;
using Windows.UI.Xaml.Navigation;

namespace High5.Xbox.Views
{
    public sealed partial class MainPage : Page
    {
        public MainPage() { InitializeComponent(); ContentFrame.Navigated += (s, e) => Nav.IsBackEnabled = ContentFrame.CanGoBack; }

        protected override void OnNavigatedTo(NavigationEventArgs e)
        {
            // Not signed in yet -> device-code sign-in first.
            ContentFrame.Navigate(App.Services.Auth.CurrentSession == null ? typeof(SignInPage) : typeof(HomePage));
        }

        private void OnInvoked(NavigationView sender, NavigationViewItemInvokedEventArgs a)
        {
            var tag = (a.InvokedItemContainer?.Tag as string) ?? "home";
            Type page = typeof(HomePage);
            if (tag == "search") page = typeof(SearchPage);
            else if (tag == "guide") page = typeof(GuidePage);
            else if (tag == "mylist") page = typeof(MyListPage);
            else if (tag == "settings") page = typeof(SettingsPage);
            ContentFrame.Navigate(page);
        }

        // Gamepad B / remote Back
        private void OnBack(NavigationView sender, NavigationViewBackRequestedEventArgs a) { if (ContentFrame.CanGoBack) ContentFrame.GoBack(); }
    }
}
