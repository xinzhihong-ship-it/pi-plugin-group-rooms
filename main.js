"use strict";

const { createBackend } = require("./lib/backend.cjs");
let backend;

module.exports = {
  async onLoad() {
    if (backend) return;
    const candidate = createBackend(globalThis.pi);
    await candidate.load();
    backend = candidate;
  },
  async onUnload() {
    const current = backend; backend = undefined;
    if (current) await current.stop();
  },
  async onPanelInvoke(channel, payload) {
    if (!backend) throw Object.assign(new Error("Group Rooms is not loaded"), { code: "UNAVAILABLE" });
    return backend.call(channel, payload, "panel");
  },
  async onRendererCall(method, args) {
    if (!backend) throw Object.assign(new Error("Group Rooms is not loaded"), { code: "UNAVAILABLE" });
    return backend.call(method, args, "renderer");
  },
  async onSessionSubmit(input) {
    if (!backend) throw Object.assign(new Error("Group Rooms is not loaded"), { code: "UNAVAILABLE" });
    return backend.submit(input);
  },
};
