# Security

## Reporting a vulnerability

Please report security issues privately through [GitHub's private vulnerability reporting](https://github.com/jacobbalane/Glim/security/advisories/new), not in a public issue. Include the Glim version, your macOS or Windows version and the steps to reproduce. Never attach real prompts, credentials or unredacted transcripts.

Useful areas to look at: the helper and its local channel (a socket on macOS, a named pipe on Windows), the connectors that edit agent settings, the installer and uninstaller, and the local usage database.

Fixes ship in a new release. The advisory is published once people can update.

## Supported versions

Only the latest release receives security fixes.

## Verifying a download

Updates installed from Settings are signed in the release workflow, and Glim refuses an update whose signature does not match the public key built into it.

Each release lists a SHA-256 checksum for every file. Files released after v0.1.0 also carry a build attestation, which proves GitHub Actions built them from this repository:

```sh
gh attestation verify Glim_<version>_universal.dmg --repo jacobbalane/Glim    # macOS, from 0.2.0
gh attestation verify Glim_<version>_x64-setup.exe --repo jacobbalane/Glim    # Windows
```
