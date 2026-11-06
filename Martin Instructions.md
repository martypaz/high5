# Martin Instructions

Everything you need to know about **high5** (the unofficial Xbox app modelled on My5), what's done, what you need to
install or sign up for, and what to do next. Written so you can follow it **from a phone** wherever possible.

> **Personal use only.** Use your own My5 account, in the UK. Don't publish this app. Not affiliated with Channel 5.

---

## 1. Where things stand (read this first)

| Thing | Status |
|---|---|
| Analysis of the My5 Android app (7.26.6) | Done - `docs/analysis/my5-7.26.6.md` |
| Core logic (screens' behaviour, parental PIN, resume, sign-in flow, My List) | **Built and tested** - 31 automatic tests pass on GitHub |
| Live connection to My5's user service (sign-in code, My List, resume) | **Written and unit-tested against a fake server only.** Never run against the real service |
| Xbox app screens (UWP) | Written. **Builds on GitHub's Windows machines** *(see section 2 for the latest build result)* |
| Real TV catalogue and video playback | **Not done.** Uses made-up demo shows and a public test video. The real catalogue/playback addresses come from the official app's remote config, which I have not touched |
| Installed on your Xbox | **Not yet** - needs your steps in section 3 |

**What you'll see if you install it today:** an Xbox app with a TV-style interface (Home, Search, TV guide, My List,
Settings, Player) showing invented demo shows and playing a test video. It proves the app shell works on your console.
It is **not yet My5**.

---

## 2. Getting the app build (no PC needed)

GitHub builds the app for you every time code is pushed.

1. On your phone open: **github.com/martypaz/high5** > **Actions** tab.
2. Open the newest run named **CI** with a green tick on the branch `ccr-52cad7bd-nxyfdf`.
3. Scroll to **Artifacts** and download **high5-xbox-sideload** (a zip). Save it to your phone.
4. Unzip it (Files by Google / any unzip app). You should see:
   - a folder `High5.Xbox_0.1.0.0_x64_Test` containing `High5.Xbox_0.1.0.0_x64.appx` (the app)
   - a `Dependencies` folder (support packages the app needs)
   - `High5.cer` (the public test certificate)

If the run shows a red cross, **don't worry - tell me and I'll fix it** (I can read the build log).

---

## 3. Putting it on your Xbox

### 3a. One-off accounts and costs

| What | Why | Cost |
|---|---|---|
| **Microsoft developer account** (Partner Center, "Windows & Xbox" individual) | Xbox "Developer Mode" needs one | A one-off registration fee, historically about **US$19** (check the current price when you sign up) |
| An Xbox One / Series X|S on the **same Wi-Fi/network as your phone** | The app is installed over the network | - |
| A free GitHub login (you already have one) | To download the build | Free |

No PC, Visual Studio or Windows licence is needed for this route.

### 3b. Turn on Developer Mode (once)
1. On the Xbox open the **Microsoft Store**, search **"Dev Mode Activation"**, install it.
2. Run it, sign in with the Microsoft account that has the developer account, and follow the prompts.
   The console restarts into **Dev Home**.
3. In Dev Home choose **Remote Access Settings**, tick **Enable Device Portal**, set a **username and password**, and
   note the **IP address** shown (for example `192.168.1.50`).
4. Note: while in Dev Mode your normal games/apps aren't reachable. You can leave Dev Mode again from the
   Dev Mode Activation app ("Switch to retail mode").

### 3c. Install the app from your phone
1. On the phone's browser go to `https://<xbox-ip>:11443` (accept the security warning - it's your own console).
2. Sign in with the Device Portal username/password.
3. Open **My games & apps** > **Add** (or "Install app").
4. Choose the **dependency packages first** (the files in `Dependencies`), then the `High5.Xbox_..._x64.appx`.
5. Start it from **Dev Home > My games & apps**.

> **Honest caveat:** I could not test steps 3c on a real console. The package is signed with a throw-away test
> certificate. Some Xbox firmware only accepts packages that were deployed from Visual Studio. If the Device Portal
> refuses the file, tell me exactly what message it shows - there are two fallbacks (a Visual Studio deployment from any
> Windows PC, or I change the packaging settings).

### 3d. If something doesn't work
Take a **photo/screenshot of the error** and send it to me. Also useful: the Xbox **OS version** (Settings > System > Console info).

---

## 4. If you ever get access to a Windows PC (optional, easier)

Install, in this order:
1. **Windows 10 or 11** (any edition).
2. **Visual Studio 2022 Community** (free) with the **"Universal Windows Platform development"** workload.
   - Inside the workload tick **Windows 10 SDK (10.0.19041.0)** and **C# and Visual Basic**.
3. **.NET SDK 8** (only if you want to run the tests: `dotnet test High5.Core.sln`).
4. **Git for Windows**.

Then:
```
git clone https://github.com/martypaz/high5
cd high5
git checkout ccr-52cad7bd-nxyfdf
```
Open `src\High5.Xbox\High5.Xbox.csproj` in Visual Studio, choose **Release | x64 | Remote Machine**, enter the Xbox IP, and press F5.

---

## 5. Making it real (the part that needs your decision)

To show **real My5 content** the app needs two values that My5's own app fetches when it starts. I have **not** put them in
the repository and I haven't extracted or used them:

* the address of the user service (`userServiceBase`), and
* the `platform` name the service expects.

If you decide to go ahead (personal use, your own account), they go in a **local file that is never committed**:

```json
{ "userServiceBase": "https://...", "platform": "..." }
```
(`ClientConfig.FromJson` already reads this.) Things you should know before deciding:

* Signing in the way the official app does uses **the official app's identity** on the server. A third-party app doing
  that may break Channel 5's terms of use and could be blocked at any time. It's your call; tell me explicitly if you want
  me to continue and how far.
* Real video also needs the catalogue and playback services (not done yet) and **PlayReady** protected streams on Xbox.
  I won't remove DRM or get around the UK-only / VPN checks.
* The safe, fully legitimate alternative is to ask Channel 5 about partner/API access.

---

## 6. What I installed on my side (so you know)

Nothing on your devices. In my temporary cloud workspace I used: **REA** (the reverse-engineering toolkit you asked for),
the **JADX** decompiler library, **androguard**, and **.NET 8**. GitHub's own Windows machines build the Xbox app.
My test certificate is generated fresh on every build and is only used to sign the test package.

## 7. Where everything is

| Path | What it is |
|---|---|
| `Martin Instructions.md` | This file |
| `README.md` | Short project overview |
| `docs/analysis/my5-7.26.6.md` | What the reverse-engineering found |
| `docs/XBOX-SETUP.md` | Technical Xbox/Visual Studio notes |
| `src/High5.Core` | The app's logic (tested) |
| `src/High5.Xbox` | The Xbox app (screens) |
| `tests/High5.Core.Tests` | Automatic tests |
| `.github/workflows/ci.yml` | The GitHub build recipe |

## 8. Quick checklist for you

- [ ] Open the Actions tab and confirm the latest CI run is green
- [ ] Decide: do you want to get the Xbox developer account (one-off fee)?
- [ ] Download `high5-xbox-sideload` and unzip it
- [ ] Enable Dev Mode + Device Portal on the Xbox
- [ ] Try the install from your phone (3c) and send me any error you see
- [ ] Decide what to do about section 5 (real data) and tell me
- [ ] Check/switch off the **link sharing** on the My5 APK file in your Google Drive (it was reachable without a login)
