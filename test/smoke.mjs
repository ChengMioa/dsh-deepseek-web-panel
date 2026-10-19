// Offline smoke test for dsh-deepseek-web/lib/client.js.
// Emulates the browser module loader, a minimal React, and the two client
// services; checks the panel/entry registration, the panel selector, and that
// the guest-side delete helper installs once.
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../lib/client.js", import.meta.url), "utf8");

const React = {
	createElement(type, props, ...children) {
		return { type, props: props ?? {}, children };
	},
};

const requireShim = (id) => {
	if (id === "react") return React;
	throw new Error(`unexpected require: ${id}`);
};

let loaded;
globalThis.window = {
	addEventListener() {},
	innerWidth: 1280,
	innerHeight: 820,
	__ModuleLoader__: {
		load(entry) {
			loaded = { id: entry.id, exports: entry.factory(requireShim) };
		},
	},
};
globalThis.document = {
	getElementById: () => null,
	createElement: () => ({ id: "", textContent: "", style: {}, appendChild() {} }),
	head: { appendChild() {} },
	addEventListener() {},
	body: { appendChild() {} },
};
globalThis.localStorage = { getItem: () => null };
globalThis.location = { reload() {} };
globalThis.Element = class {};
globalThis.fetch = async () => ({
	ok: true,
	json: async () => ({ data: { biz_data: { chat_sessions: [] } } }),
});

new Function(source)();

const mod = loaded.exports;
if (typeof mod.apply !== "function") throw new Error("client bundle did not export apply");
if (!Array.isArray(mod.inject)) throw new Error("client bundle did not export inject");

const calls = [];
const registered = [];
const ctx = {
	slots: {
		inject(name, callback) {
			calls.push(["slots.inject", name]);
			return callback();
		},
		register(config, Component) {
			registered.push({ config, Component });
			calls.push(["slots.register", config.name, config.key ?? config.id]);
			return () => {};
		},
	},
	layout: {
		selectPanel(id) {
			calls.push(["selectPanel", id]);
		},
	},
};

mod.apply(ctx);

const panel = registered.find((entry) => entry.config.name === "main");
if (panel === undefined) throw new Error("main panel was not registered");
if (panel.config.key !== mod.PANEL_ID) throw new Error(`wrong panel key: ${panel.config.key}`);

const action = registered.find((entry) => entry.config.name === "sidebar.footer.action");
if (action === undefined) throw new Error("footer action was not registered");
const element = action.Component({ wide: true });
if (element.type !== "button") throw new Error("action root is not a button");
element.props.onClick();
const selected = calls.find((call) => call[0] === "selectPanel");
if (selected === undefined || selected[1] !== mod.PANEL_ID) throw new Error("panel was not selected");
console.log("ok: registration");

// The helper installs once per document and talks to the site's own API.
if (!mod.DELETE_HELPER_SCRIPT.includes("/api/v0/chat_session/delete")) throw new Error("delete endpoint missing");
if (!mod.DELETE_HELPER_SCRIPT.includes("chat_session_ids")) throw new Error("delete payload missing");
if (!mod.DELETE_HELPER_SCRIPT.includes("再次点击确认删除")) throw new Error("confirmation missing");

const runHelper = () =>
	new Function(
		"window",
		"document",
		"localStorage",
		"fetch",
		"Element",
		"location",
		`"use strict"; return ${mod.DELETE_HELPER_SCRIPT}`,
	)(globalThis.window, globalThis.document, globalThis.localStorage, globalThis.fetch, globalThis.Element, globalThis.location);

const first = runHelper();
const second = runHelper();
if (first !== "installed" || second !== "installed") throw new Error(`helper install: ${first}/${second}`);
await new Promise((resolve) => setTimeout(resolve, 20));
console.log("ok: delete helper");
