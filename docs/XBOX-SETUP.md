# Building and running on Xbox

The UWP shell in `src/High5.Xbox` has **not been compiled yet** (it was written on Linux). Expect a few
small fixes on first build. The logic it uses (`High5.Core`) is tested.

## 1. Create the project (Windows 10/11)
1. Install Visual Studio 2022 with the **Universal Windows Platform development** workload.
2. File > New > **Blank App (Universal Windows)**, name it `High5.Xbox`, min version 1809 (17763).
3. Delete the generated `MainPage.xaml(.cs)` and `App.xaml(.cs)`.
4. Copy this repo's `src/High5.Xbox/*` (keep the `Views` folder) into the project and **Add > Existing Item**.
5. Right-click the project > Add > Reference > Projects > **High5.Core** (add `src/High5.Core/High5.Core.csproj` to the solution first).
6. Compare the generated `Package.appxmanifest` with `Package.appxmanifest.sample` (Universal family, `internetClient`).
7. If the compiler complains about C# features, set the project's language version to 8.0+ (Build > Advanced).

## 2. Run on the console
1. Xbox: install **Dev Mode Activation**, activate Developer Mode (needs a free/paid Dev Center account), restart into Dev Mode.
2. Visual Studio: configuration **Release/Debug - x64 - Remote Machine**, enter the console's IP, pair with the PIN shown on the console.
3. F5. The app appears in My games & apps under Dev Home.

## 3. Things to check on first run
- Focus visuals / D-pad navigation on every page (grid and list `XYFocus`).
- Title-safe margins on a real TV (pages use 48px margins).
- `PlayerPage`: HLS demo stream plays; PlayReady path is untested until a protected source is available.
- On-screen keyboard appears when selecting the search box.
