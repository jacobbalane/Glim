# Glim Desktop Island privacy policy

Last updated: October 1, 2026

Glim Desktop Island (Glim) is developed by Jacob Balane, published as jacobbalane. This policy describes the current Windows development preview, its bundled status relay, and its optional VS Code companion extension. It covers application version 0.1.0, including the Microsoft Store candidate with package version 1.0.0.0. Integration setup and live subscription-usage monitoring are still under development.

## Information processed on your computer

When you configure a coding agent to send events to Glim's relay, the relay processes the event in memory and saves selected status metadata locally:

- The agent provider, session identifier, optional turn identifier, and a generated event identifier.
- The final folder name of the project directory, activity status, and the time of the observation.
- Process identifiers and start times used to associate the session with its agent and terminal.

Agent hook events can include additional information, such as prompts, tool inputs or results, full directory paths, and transcript references. Glim's relay reads the supplied event in memory, but its saved status records include only the selected metadata above. It does not save the prompt, tool input/result, transcript, or authentication fields from those events. It does not open project source files or transcript files as part of this collection.

The desktop app and relay inspect local process information, including process names, identifiers, parent relationships, and start times, to match sessions and check whether their processes are still running. Only the process identifiers and start times described above are saved in status records.

When enabled, the VS Code companion reads terminal display names and process identifiers and generates temporary window and terminal identifiers. It exchanges these with Glim through a local Windows named pipe so Glim can locate a terminal when you request to return to it. These terminal registrations are held in memory. The companion does not read terminal output or submit commands to your terminal.

The desktop app and companion read the current Windows user's identity information to obtain the security identifier (SID) used to name and restrict access to that local connection. Project and terminal names, session identifiers, and Windows identity information may identify you or your work.

The current desktop preview does not retrieve subscription usage or account details from Claude or Codex. Separate developer probes in the source repository are not part of the bundled desktop application.

## Purpose and sharing

Glim uses this information to display local agent status, identify stale sessions, and route your request to return to a terminal. Glim does not upload monitoring records to the developer or a Glim-operated service. The app has no Glim analytics, advertising, or remote crash-reporting service, and the developer does not sell monitoring information.

The local terminal connection is restricted to the current Windows user and rejects remote clients. Saved status records are ordinary local files; Glim does not add its own encryption to them.

Windows, Microsoft Store, the WebView2 runtime, VS Code, and your coding-agent providers are separate products with their own data handling and privacy policies. Windows or backup software you use may copy local files. This policy does not describe or control those services.

## Storage and retention

Status records are saved in an `observations` folder under Glim's per-user local application-data location. Windows packaging can affect the physical location. An explicitly configured `GLIM_DATA_DIR` environment variable overrides this location.

After saving an observation, the relay attempts to remove observation files older than 24 hours and prune excess records. Its count target is 2,048 files, with an exception to preserve the latest record for up to 128 sessions. These are cleanup rules, not a guarantee that files disappear at a particular time: cleanup depends on further collection and successful file access. Files can remain longer when collection stops or cleanup fails.

Terminal registrations are not written to Glim's status registry and are released when the relevant connection or process ends. WebView2 may maintain additional runtime profile and cache files separately from the status registry.

## Your choices

To stop collection, disable or remove the Glim hook entries you configured in your agent tools, disable or uninstall the Glim VS Code companion, and quit Glim. Closing or hiding the island alone does not disable configured agent hooks; the relay can continue saving observations when those hooks run.

After stopping collection, you can delete Glim's `observations` folder to remove its saved status records. Uninstalling the desktop app does not necessarily remove separately installed VS Code extensions, agent configuration entries, or data from an earlier installation. The current preview does not provide an in-app data-deletion control.

## Support and contact

For privacy questions or help locating and removing Glim's local data, contact the developer through [Glim's GitHub issue tracker](https://github.com/jacobbalane/Glim/issues). GitHub issues are public: do not include private prompts, credentials, personal files, or sensitive project details.

If you choose to contact us there, your GitHub username and anything you post are visible to the developer and other visitors and may be used to answer your request. GitHub hosts this correspondence and handles its retention and account controls under the [GitHub Privacy Statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement).

## Changes to this policy

We will update this page and its date when Glim's data handling changes. This policy will be reviewed alongside future integration and usage-monitoring features before they are released.
