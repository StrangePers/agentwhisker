# AgentWhisker desktop platform rollout

Bring Kitsu and direct agent connections to more desktops while maintaining the stable Windows download.

## Product

- Package Linux x64 as a `tar.gz` for X11 and Apple Silicon as a ZIP containing an `.app`. Evaluate native Wayland, Linux ARM, and Intel Mac separately.
- Test each extracted archive. Cover startup, JSON status, settings near screen edges, hide and restore, and quit. Test transparent-background clicks, the first character click, and dragging in a graphical session.
- Use GitHub prereleases for early builds. Record the actual signing and test status for each platform. Use Developer ID signing and notarization before promoting macOS to stable.

## Design

- Keep Kitsu's animations central to the landing page. Show the platform, architecture, and channel beside each download. Stack the choices on narrow screens.
- Update the repository description, README, release notes, and localized landing page. Put OS requirements and verified source integrations next to the downloads or in the linked setup instructions.

## Marketing

- Lead with the ability to see at a glance whether an agent is working or needs attention. Highlight Codex and OpenCode Go limits as a way to decide when to start the next task.
- Send newcomers to one landing page and GitHub Releases. Mark the Windows release and previews with their respective channels.
- After release, track download counts by archive and recurring installation or desktop issues on GitHub. Require successful installations and a working core flow before promoting a preview.

## Build and acceptance

- [x] Package Linux and macOS with the pinned Electron runtime, Kitsu, and existing licenses. Keep the dedicated Windows build.
- [x] Add a workflow that builds and tests archives on their target OS and generates SHA-256 manifests.
- [x] Verify the extracted builds on Ubuntu 24.04 X11 and macOS 15 Apple Silicon. Cover application startup, Kitsu’s four animations, JSON status, settings persistence, and the four languages on both. Verify click-through and the first character click at 160 and 360 on Linux.
- [ ] Validate native macOS desktop clicks, dragging on both preview platforms, opening the Mac archive from a browser download, and live agent connections. Use those results when deciding whether to promote the previews.
- [x] Publish Linux and macOS as [v0.1.3-preview.1](https://github.com/StrangePers/agentwhisker/releases/tag/v0.1.3-preview.1). Download both public assets without authentication and verify their SHA-256 hashes. Check the live platform picker in all four languages at 320, 390, and 1360 px. Windows v0.1.2 remains the latest stable release.
