(function(root) {
  const ids = ["codex", "opencode", "claude-code", "qwen-code", "t3code", "roleshuttle", "json-status"];
  function decode(value) {
    if (value === "codex-opencode") return ["codex", "opencode"];
    const parts = String(value || "").replace(/^agents:/, "").split(",");
    return ids.filter(id => parts.includes(id));
  }
  function encode(selected) {
    const checked = ids.filter(id => selected.includes(id));
    if (!checked.length) return "desktop";
    return checked.length === 1 ? checked[0] : "agents:" + checked.join(",");
  }
  const api = {ids, decode, encode};
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.agentSelection = api;
})(globalThis);
