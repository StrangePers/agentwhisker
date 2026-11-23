# Windows sign-in and task notifications

AgentWhisker v0.1.6 for Windows adds optional sign-in launch and quiet task notifications. Open Kitsu’s settings to enable either option. Both start off.

- **Start when I sign in to Windows** starts the portable copy from its current folder. Enable it again if you move the folder. When Agent Console starts the same copy, its managed companion takes over.
- **Notify when a task needs a reply or fails** shows the task title and its new state through the Windows notification area. Notifications are silent and respect Windows quiet time. Tasks already waiting when you connect or enable notifications stay quiet. A task can alert again if it resumes work and later needs your attention.

The sign-in preference applies to your Windows account. Notification preferences follow the current AgentWhisker profile.

For a custom JSON source with several tasks, give each task a stable `items[].id` so its transitions can be tracked when the list changes order.

## Also in this Windows release

- Kitsu offers detected local agents on first launch. Choose one, connect another source manually, or keep Kitsu as a desktop companion.
- In Kitsu’s task list, a Codex task marked **Open project folder** opens its local working folder when available.
- The Windows ZIP includes Kitsu. See the [artwork terms](https://strangepers.github.io/agentwhisker/artwork.html) for coverage, redistribution and permission requests.

## Download

Download `AgentWhisker-0.1.6-win-x64.zip`, verify it against `SHA256SUMS.txt`, extract the entire archive, and open `AgentWhisker.exe`. This is a portable, unsigned Windows x64 build. The [Linux and macOS Preview](https://github.com/StrangePers/agentwhisker/releases/tag/v0.1.3-preview.1) remains available separately.

[Project website](https://strangepers.github.io/agentwhisker/)
