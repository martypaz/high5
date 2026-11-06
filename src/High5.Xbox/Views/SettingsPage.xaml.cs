using System;
using High5.Core.Models;
using Windows.UI.Xaml;
using Windows.UI.Xaml.Controls;

namespace High5.Xbox.Views
{
    public sealed partial class SettingsPage : Page
    {
        private bool _loading = true;
        public SettingsPage()
        {
            InitializeComponent();
            Rating.ItemsSource = Enum.GetValues(typeof(AgeRating));
            Rating.SelectedItem = App.Services.Parental.MaxRating;
            _loading = false;
        }

        private void OnSetPin(object s, RoutedEventArgs e)
        {
            try { App.Services.Parental.SetPin(Pin.Password); Status.Text = "PIN saved."; Pin.Password = ""; }
            catch (ArgumentException ex) { Status.Text = ex.Message; }
        }

        private void OnRating(object s, SelectionChangedEventArgs e)
        {
            if (_loading || Rating.SelectedItem == null) return;
            // Lowering the limit needs the PIN once one exists.
            var ok = App.Services.Parental.SetMaxRating((AgeRating)Rating.SelectedItem, Pin.Password);
            Status.Text = ok ? "Rating limit updated." : "Enter your PIN above to change the rating limit.";
            if (!ok) { _loading = true; Rating.SelectedItem = App.Services.Parental.MaxRating; _loading = false; }
        }

        private async void OnSignOut(object s, RoutedEventArgs e)
        {
            await App.Services.Auth.SignOutAsync();
            Frame.Navigate(typeof(SignInPage));
        }
    }
}
