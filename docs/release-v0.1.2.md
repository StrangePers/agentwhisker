# AgentWhisker v0.1.2

Connect **Codex, Claude Code, OpenCode, or Qwen Code** from Kitsu’s settings without setting up Agent Console. Start a session in your agent, hover over Kitsu, open the gear menu, and choose your agent under **Source**.

- **Codex** keeps showing work in progress when a tool finishes during an active turn.
- **Claude Code** follows the current turn and ignores stale errors from earlier turns.
- **OpenCode** supports the v2 local service and reads the local session database when the service is unavailable. Pending questions and permission requests are visible while the service is running.
- **Qwen Code** joins the source menu. Session activity and turn completion were verified with Qwen Code 1.0.0-preview.2.

JSON status files and the Agent Console bridge remain available. T3Code is experimental.

Download **AgentWhisker-0.1.2-win-x64.zip**, extract the entire ZIP, and run **AgentWhisker.exe**. Verify the archive against **SHA256SUMS.txt**. The portable, unsigned build includes Kitsu and was tested on Windows x64. [Project website](https://strangepers.github.io/agentwhisker/).
