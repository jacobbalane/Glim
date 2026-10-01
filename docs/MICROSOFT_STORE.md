# Microsoft Store distribution

Glim is preparing an **MSIX** release for the Microsoft Store. Microsoft signs approved MSIX packages, so this route does not require purchasing a signing certificate. The existing GitHub EXE remains an unsigned development preview; Store preparation does not change that download's trust. See Microsoft's [signing options](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/code-signing-options).

The packaging target is initially **Windows 11 x64** (minimum build 22000), matching the development platform. ARM64 and Windows 10 are not yet validated targets. The app itself remains a Tauri/Rust desktop app with its React interface.

## Publisher account and identity

The reserved Store title for this project is **Glim Desktop Island**, under publisher **jacobbalane**. The owner supplied the assigned identity on 2026-10-01, and it is configured in `.local/msix-identity.json`. The short project name and GitHub repository remain Glim.

1. Begin at [storedeveloper.microsoft.com](https://storedeveloper.microsoft.com/), using the free registration flow. Individual is appropriate for a personal hobby project. Complete Microsoft sign-in, identity verification and agreements yourself. See [Microsoft's registration instructions](https://learn.microsoft.com/en-us/windows/apps/publish/partner-center/open-a-developer-account).
2. In Partner Center, create an **MSIX or PWA app** and reserve an available title. This project's reservation is **Glim Desktop Island** because **Glim** was unavailable. The EXE/MSI submission route has different signing requirements and is not this route.
3. Open **Product management → Product identity**. Copy the three exact [identity values](https://learn.microsoft.com/en-us/windows/apps/publish/view-app-identity-details) into a local copy of `packaging/msix/identity.example.json`:

   | JSON key | Partner Center value |
   | --- | --- |
   | `identityName` | `Package/Identity/Name` |
   | `publisher` | `Package/Identity/Publisher`, including `CN=` |
   | `publisherDisplayName` | `Package/Properties/PublisherDisplayName` |
   | `displayName` | The reserved app name |

Save the completed file as `.local/msix-identity.json`. These values are package metadata, not credentials. No password, account token, signing key or identity document belongs in the repository.

`packageVersion` is a separate, four-part Windows package version. The initial example uses `1.0.0.0`; this does **not** change the application's current `0.1.0` product version or imply a finished 1.0 release. Increment the package version for subsequent uploads/updates. The first component must be positive; the fourth is reserved for the Store and remains zero. See [package requirements](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/app-package-requirements?pivots=store-installer-msix).

## Build

Requires the existing Node/Rust/C++ development prerequisites and Windows SDK with MakeAppx. The script discovers an installed SDK; `GLIM_MAKEAPPX` can select a particular executable.

Before a publisher identity is available:

```powershell
npm run package:msix -- --validation
```

With the actual Partner Center identity:

```powershell
npm run package:msix -- --identity .local/msix-identity.json
```

Both commands build current release source, prepare the relay and VSIX, generate icons from `assets/glim.svg`, stage an explicit file list, and run MakeAppx with validation enabled. The script then unpacks the MSIX and compares every staged file's SHA-256 hash. The packaged relay statically links its C runtime so it does not depend on `VCRUNTIME140.dll` being installed separately.

Output is under `.local/msix/validation-*/` or `.local/msix/store-candidate-*/`. Each run has its own directory containing the package, layout, unpacked verification copy, checksum and build report. Local validation uses a visibly different display name and relay alias. The Store mode rejects the example's placeholder identity.

An unsigned MSIX is a build/submission artifact, **not a consumer download**. The script does not install a certificate, change Windows settings, register an app, or submit to Partner Center. Building and extracting successfully only validates packaging; it does not establish that Windows will install it or that Microsoft will certify it. Microsoft documents the scope of [MakeAppx validation](https://learn.microsoft.com/en-us/windows/msix/package/create-app-package-with-makeappx-tool).

The first identity-matched candidate passed local package validation and a temporary development-layout registration on 2026-10-01. Its registered relay alias passed eight concurrent synthetic sessions and three malformed-input cases using isolated data. Both the registration and alias were removed afterward. This was a developer test using the PC's existing Developer Mode, not a signed MSIX installation or a Store certification result. Visual inspection was unavailable because the Computer Use helper could not connect.

## Package behavior to verify

The manifest uses `packagedClassicApp` with `mediumIL` and the `runFullTrust` capability. This retains desktop window/tray behavior and normal user permissions. It does not request administrator elevation. Proposed capability explanation for certification:

> Glim is a desktop companion with a floating status window and tray controls. It collects sanitized lifecycle metadata from user-configured local CLI hooks, checks process identities, and communicates with its VS Code companion through a current-user-only named pipe to reveal the selected terminal. It does not require administrator permissions.

The package registers **`glim-relay.exe`** as a console app execution alias pointing to the bundled helper. This is intended to keep hooks working across versioned installation directories. Local validation instead registers the name **`glim-validation-relay.exe`** if explicitly installed for development. Hook onboarding must resolve the expected per-user WindowsApps alias, check that it is enabled, and verify its package identity. Never persist a version-specific `C:\Program Files\WindowsApps\...` executable path in CLI configuration. The alias declaration is implemented; invocation and onboarding are not yet proven.

| Check before submission | Required evidence |
| --- | --- |
| Packaged launch and WebView2 | Start menu launch renders the island on a clean Windows 11 account. WebView2 is normally included with Windows 11; handle a missing runtime explicitly. Unlike the NSIS installer, this MSIX has no bootstrapper. |
| Hook alias | Arguments, JSON stdin, silent completion and eight concurrent synthetic calls passed through the registered alias. Still verify actual CLI hooks from VS Code terminals, console-window behavior and agent performance. |
| Shared storage | Packaged relay and host see the same metadata, including when the island is closed, after reboot and across upgrades. Account for MSIX AppData virtualization and any previous NSIS data. |
| VS Code bridge | The packaged host accepts the unpackaged extension's current-user connection, matches ancestry through alias activation and returns to the exact terminal/window. |
| Updates and coexistence | Hook alias and stored observations survive a version increase. A previous NSIS installation does not silently conflict through the shared pipe/single-instance mechanism. |
| Uninstall | Glim-owned hook entries can be removed without changing other hooks; alias and package removal leave no broken user workflow. MSIX uninstall does not run the NSIS uninstaller or custom hook cleanup. |
| Product readiness | Complete real Claude/Codex onboarding and monitoring, quota adapters and the native interaction checks in `IMPLEMENTATION.md`. |
| Privacy and storage | Review the current plain JSON observation files and local IPC against [Store policy 10.5](https://learn.microsoft.com/en-us/windows/apps/publish/store-policies#105-personal-information), including its data-protection requirements. The privacy policy documents current behavior; publishing it does not establish compliance. |
| Certification | Run the Windows App Certification Kit, complete age ratings, provide accurate screenshots, support/privacy URLs and capability explanations, and review the final submission. |

The underlying behaviors are documented in Microsoft's [packaged desktop app guide](https://learn.microsoft.com/en-us/windows/msix/desktop/desktop-to-uwp-behind-the-scenes), [execution alias schema](https://learn.microsoft.com/en-us/uwp/schemas/appxpackage/uapmanifestschema/element-uap5-extension) and [WebView2 distribution guide](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/distribution). These references establish available mechanisms; installed Glim still needs the checks above.

For initial server-side package validation, open Glim Desktop Island in Partner Center, choose **Start submission**, then upload the identity-matched MSIX under **Packages** and save the draft. Draft upload does not publish the app. Keep certification pending until the installation, integration and product-readiness checks above are complete; then review the listing and submit for certification. See Microsoft's [submission steps](https://learn.microsoft.com/en-us/windows/apps/publish/get-started).

The README can link to the actual Store listing after approval. Do not advertise an unapproved package as Store available or replace the GitHub download with an unsigned MSIX.

## Properties for the current Store draft

Use these values for the current preview; reassess declarations when its behavior changes.

| Field | Value |
| --- | --- |
| Category | Developer tools |
| Subcategory | Utilities |
| Secondary category | Leave blank / None |
| Accesses, collects or transmits personal information | Yes. Locally processed identifiers and project/terminal names can identify a person or their work. |
| Privacy policy URL | `https://github.com/jacobbalane/Glim/blob/main/PRIVACY.md` |
| Website | `https://github.com/jacobbalane/Glim` |
| Support contact info | `https://github.com/jacobbalane/Glim/issues` |
| Optional phone/address | Leave blank for this individual developer submission. |
| Immersive / Windows Mixed Reality display modes | Unchecked; the app is a 2D desktop window. |
| Optional hardware requirements | Leave blank / Not specified until measured; the package already targets Windows 11 x64. |

Partner Center also supports **Provide privacy policy text**: paste the contents of [PRIVACY.md](../PRIVACY.md) if using that option. No paid policy hosting is needed. See Microsoft's [category table](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msix/categories-and-subcategories), [privacy and support guidance](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msix/support-info), and [optional system requirements](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msix/system-requirements).

For the [documented product declarations](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msix/product-declarations), use these recommendations if those exact options appear:

- **Purchases outside Microsoft Store commerce:** unchecked; Glim has no purchase flow.
- **Tested to meet accessibility guidelines:** unchecked until end-to-end accessibility testing is complete.
- **Install to alternate drives or removable storage:** unchecked for now; validate that installation route before enabling it.
- **Include app data in automatic OneDrive backups:** unchecked; session observations are temporary local monitoring data.
- **Record and broadcast clips of this game:** unchecked; Glim is not a game.
- **Pen and ink input:** unchecked; no dedicated pen or ink features.
- **Incorporates generative AI features:** unchecked for the current status viewer; Glim does not generate content or invoke models. Reassess if agent interaction is added.

Review any additional declaration by its actual label rather than assuming all checkboxes have the same meaning. Save the draft. Completing Properties does not mean the app is ready for certification; the remaining product checks above still apply.
