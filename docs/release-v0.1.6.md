# Windows sign-in and task notifications

Open Kitsu’s settings to enable either option. Both start off.

- **Start when I sign in to Windows** starts the portable copy from its current folder. Enable it again if you move the folder. When Agent Console starts the same copy, its managed companion takes over.
- **Notify when a task needs a reply or fails** shows the task title and its new state through the Windows notification area. Notifications are silent and respect Windows quiet time. Tasks already waiting when you connect or enable notifications stay quiet. A task can alert again if it resumes work and later needs your attention.

The sign-in preference applies to your Windows account. Notification preferences follow the current AgentWhisker profile.

For a custom JSON source with several tasks, give each task a stable `items[].id` so its transitions can be tracked when the list changes order.
