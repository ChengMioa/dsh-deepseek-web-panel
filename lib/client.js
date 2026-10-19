window.__ModuleLoader__.load({
	id: "dsh-deepseek-web-panel",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		const React = require("react");

		/** Main-panel id. Also the key of the `main` slot body. */
		const PANEL_ID = "deepseek-web";
		/** The page the panel opens. It is the real website, not an API client. */
		const DEEPSEEK_URL = "https://chat.deepseek.com/";

		const STYLE_ID = "dsh-deepseek-web-style";
		/** Last session shown in the conversation view; quoting targets it. */
		let lastSessionId;
		/** Root client context, used to switch back and insert text. */
		let pluginContext = null;
		/** Last guest address, restored when the panel is mounted again. */
		let lastUrl = "";
		const CSS = `
.dsh-deepseek-web-panel{position:relative;display:flex;flex:1;min-width:0;min-height:0;height:100%;background:var(--dsw-alias-bg-base)}
/* The frame only publishes the leading clearance while the sidebar column is
   fully hidden (macOS). In that state the panel reaches the window corner and
   the site header would sit under the traffic lights, so drop the content by
   the top-band height. min() keeps it at 0 whenever the sidebar is visible. */
[data-platform=darwin] .dsh-deepseek-web-panel{padding-top:min(var(--dsh-frame-leading-clearance,0px),48px)}
.dsh-deepseek-web-drag{display:none}
[data-platform=darwin] .dsh-deepseek-web-drag{display:block;position:absolute;top:0;left:var(--dsh-frame-leading-clearance,0px);right:0;height:min(var(--dsh-frame-leading-clearance,0px),48px);z-index:5;-webkit-app-region:drag}
.dsh-deepseek-web-stage{position:relative;display:flex;flex:1;min-width:0;min-height:0}
.dsh-deepseek-web-host{display:flex;flex:1;min-width:0;min-height:0}
.dsh-deepseek-web-host webview{display:flex;flex:1;width:100%;height:100%;min-height:0;border:0;-webkit-app-region:no-drag}
.dsh-deepseek-web-quote{position:absolute;right:10px;top:50%;transform:translateY(-50%);width:34px;height:34px;border-radius:50%;border:.5px solid var(--dsw-alias-border-l3);background:color-mix(in srgb, var(--dsw-alias-bg-layer-2) 82%, transparent);color:var(--dsw-alias-label-secondary);cursor:pointer;display:flex;align-items:center;justify-content:center;z-index:6;font-size:15px;line-height:1;opacity:.72;backdrop-filter:blur(8px)}
.dsh-deepseek-web-quote:hover{opacity:1;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-3)}
.dsh-deepseek-web-quote:focus-visible{outline:1px solid var(--dsw-alias-state-business-primary);outline-offset:1px}
.dsh-deepseek-web-toast{position:absolute;left:50%;bottom:18px;transform:translateX(-50%);padding:6px 10px;border-radius:8px;background:color-mix(in srgb, var(--dsw-alias-bg-layer-3) 92%, transparent);color:var(--dsw-alias-label-secondary);font:var(--dsw-font-xxs-12);z-index:7;pointer-events:none;box-shadow:0 6px 18px rgba(0,0,0,.35)}
.dsh-deepseek-web-status{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font:var(--dsw-font-xs-13);color:var(--dsw-alias-label-tertiary);background:var(--dsw-alias-bg-base);pointer-events:none}
.dsh-deepseek-web-action{display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 8px;border:0;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;font:inherit;font-size:12px;line-height:1;white-space:nowrap}
.dsh-deepseek-web-action:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.dsh-deepseek-web-action:focus-visible{outline:1px solid var(--dsw-alias-state-business-primary);outline-offset:-1px}
.dsh-deepseek-web-action svg{flex:none}
`;

		/**
		 * Installed inside the guest document. It reads the site's own session
		 * list (title -> id) and adds a right-click delete menu over the sidebar.
		 * The bearer token never leaves the page: it is read from the site's own
		 * localStorage and used only for the requests this script makes.
		 */
		const DELETE_HELPER_SCRIPT = `(() => {
	if (window.__dshRightClickDelete === true) return "installed";
	window.__dshRightClickDelete = true;

	const readToken = () => {
		try {
			const stored = localStorage.getItem("userToken");
			if (stored === null) return "";
			try {
				const parsed = JSON.parse(stored);
				if (typeof parsed === "string") return parsed;
				return parsed && typeof parsed.value === "string" ? parsed.value : "";
			} catch {
				return stored;
			}
		} catch {
			return "";
		}
	};

	const headers = (extra) => {
		const value = Object.assign({ accept: "application/json" }, extra || {});
		const token = readToken();
		if (token !== "") value.Authorization = "Bearer " + token;
		return value;
	};

	let sessions = [];
	let sessionsAt = 0;
	const loadSessions = async () => {
		if (sessions.length > 0 && Date.now() - sessionsAt < 60000) return;
		try {
			const now = Math.floor(Date.now() / 1000) + 60;
			const response = await fetch("/api/v0/chat_session/fetch_page?lte_cursor.pinned=false&lte_cursor.updated_at=" + now + "&count=200", {
				credentials: "include",
				headers: headers()
			});
			if (!response.ok) return;
			const json = await response.json();
			const list = json && json.data && json.data.biz_data && json.data.biz_data.chat_sessions;
			if (!Array.isArray(list)) return;
			sessions = list
				.map((item) => ({ id: item.id, title: typeof item.title === "string" ? item.title.trim() : "" }))
				.filter((item) => typeof item.id === "string" && item.title !== "");
			sessionsAt = Date.now();
		} catch {}
	};

	let menu = null;
	const close = () => {
		if (menu !== null) {
			menu.remove();
			menu = null;
		}
	};

	const removeSession = async (id) => {
		try {
			const response = await fetch("/api/v0/chat_session/delete", {
				method: "POST",
				credentials: "include",
				headers: headers({ "content-type": "application/json" }),
				body: JSON.stringify({ chat_session_ids: [id] })
			});
			return response.ok;
		} catch {
			return false;
		}
	};

	const rowText = (target) => {
		let node = target;
		for (let depth = 0; depth < 5 && node instanceof Element; depth++, node = node.parentElement) {
			const text = (node.innerText || "").trim();
			if (text !== "" && text.length <= 160 && text.indexOf("\\n") === -1) return text;
		}
		return "";
	};

	document.addEventListener("contextmenu", (event) => {
		// The site's conversation list lives in the left column. Leave the chat
		// area's native context menu alone.
		if (event.clientX > 340) return;
		const text = rowText(event.target);
		if (text === "") return;
		const exact = sessions.filter((item) => item.title === text);
		const prefix = exact.length === 0
			? sessions.filter((item) => item.title !== "" && text.startsWith(item.title))
			: [];
		// Never guess between duplicates: a wrong match would delete the wrong chat.
		const match = exact.length === 1 ? exact[0] : exact.length === 0 && prefix.length === 1 ? prefix[0] : undefined;
		if (match === undefined) return;
		event.preventDefault();
		close();

		menu = document.createElement("div");
		menu.style.cssText = "position:fixed;z-index:2147483647;min-width:190px;max-width:280px;padding:5px;border-radius:10px;background:#262626;color:#e8e8e8;border:1px solid rgba(255,255,255,.12);box-shadow:0 10px 30px rgba(0,0,0,.5);font:13px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif";
		const title = document.createElement("div");
		title.textContent = match.title;
		title.style.cssText = "padding:6px 8px;color:#9b9b9b;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap";
		const button = document.createElement("button");
		button.type = "button";
		button.textContent = "删除该对话";
		button.style.cssText = "display:block;width:100%;text-align:left;padding:8px;border:0;border-radius:6px;background:transparent;color:#ff7a7a;cursor:pointer;font:inherit";
		let armed = false;
		button.addEventListener("mouseenter", () => { button.style.background = "rgba(255,255,255,.08)"; });
		button.addEventListener("mouseleave", () => { button.style.background = "transparent"; });
		button.addEventListener("click", async () => {
			if (!armed) {
				armed = true;
				button.textContent = "再次点击确认删除";
				return;
			}
			button.disabled = true;
			button.textContent = "删除中…";
			const ok = await removeSession(match.id);
			if (ok) location.reload();
			else {
				button.disabled = false;
				button.textContent = "删除失败，点击重试";
				armed = false;
			}
		});
		menu.appendChild(title);
		menu.appendChild(button);
		document.body.appendChild(menu);
		menu.style.left = Math.max(8, Math.min(event.clientX, window.innerWidth - 290)) + "px";
		menu.style.top = Math.max(8, Math.min(event.clientY, window.innerHeight - 90)) + "px";
	}, true);

	document.addEventListener("mousedown", (event) => {
		if (menu !== null && !menu.contains(event.target)) close();
	}, true);
	document.addEventListener("keydown", (event) => {
		if (event.key === "Escape") close();
	}, true);
	window.addEventListener("scroll", close, true);

	void loadSessions();
	return "installed";
})()`;

		/**
		 * Installed inside the guest document: remembers the current selection so
		 * the quote button still sees it after the webview loses focus.
		 */
		const SELECTION_SCRIPT = `(() => {
	if (window.__dshDeepSeekSelectionHook === true) return "installed";
	window.__dshDeepSeekSelectionHook = true;
	const update = () => {
		try {
			window.__dshDeepSeekSelection = String(window.getSelection() || "").trim();
		} catch {
			window.__dshDeepSeekSelection = "";
		}
	};
	document.addEventListener("selectionchange", update, true);
	document.addEventListener("mouseup", update, true);
	document.addEventListener("keydown", update, true);
	return "installed";
})()`;

		/** Format a selection as a Markdown quote block. */
		function formatQuote(text) {
			const cleaned = text.replace(/\r\n/g, "\n").trim();
			if (cleaned === "") return "";
			return cleaned
				.split("\n")
				.map((line) => (line.trim() === "" ? ">" : `> ${line}`))
				.join("\n") + "\n\n";
		}

		/** Wait for the conversation composer to mount after switching panels. */
		function waitForShell(ctx, sessionId, timeoutMs) {
			return new Promise((resolve) => {
				const started = Date.now();
				const tick = () => {
					let shell;
					try {
						shell = ctx.conversation?.input?.shell?.(sessionId);
					} catch {
						shell = undefined;
					}
					if (shell !== undefined) {
						resolve(shell);
						return;
					}
					if (Date.now() - started >= timeoutMs) {
						resolve(undefined);
						return;
					}
					setTimeout(tick, 60);
				};
				tick();
			});
		}

		/**
		 * Switch back to the conversation, then insert the quote into its composer.
		 * Falls back to the clipboard when no composer can be reached.
		 */
		async function quoteIntoChat(text) {
			const ctx = pluginContext;
			if (ctx === null || typeof lastSessionId !== "string" || lastSessionId === "") return false;
			const block = formatQuote(text);
			if (block === "") return false;
			try {
				ctx.layout.selectPanel(null);
			} catch {
				return false;
			}
			const shell = await waitForShell(ctx, lastSessionId, 2500);
			if (shell === undefined) {
				try {
					await navigator.clipboard.writeText(block);
				} catch {}
				return false;
			}
			let inserted = false;
			try {
				if (shell.actions !== undefined && typeof shell.actions.insertText === "function") {
					const span = typeof shell.actions.captureInsertion === "function" ? shell.actions.captureInsertion() : undefined;
					inserted = Boolean(shell.actions.insertText(block, span));
				}
			} catch {
				inserted = false;
			}
			if (!inserted && typeof shell.setDraft === "function") {
				const current = typeof shell.projection?.clipboardText === "string" ? shell.projection.clipboardText : "";
				shell.setDraft(current.trim() === "" ? block : `${current.replace(/\s+$/, "")}\n\n${block}`);
				inserted = true;
			}
			try {
				shell.focus?.();
			} catch {}
			return inserted;
		}

		function ensureStyle() {
			if (document.getElementById(STYLE_ID) !== null) return;
			const style = document.createElement("style");
			style.id = STYLE_ID;
			style.textContent = CSS;
			document.head.appendChild(style);
		}

		function GlobeIcon(props) {
			const size = typeof props?.size === "number" ? props.size : 16;
			return React.createElement(
				"svg",
				{
					width: size,
					height: size,
					viewBox: "0 0 16 16",
					fill: "none",
					stroke: "currentColor",
					strokeWidth: 1.3,
					strokeLinecap: "round",
					strokeLinejoin: "round",
					"aria-hidden": "true",
				},
				React.createElement("circle", { cx: 8, cy: 8, r: 6.2 }),
				React.createElement("path", { d: "M1.9 8h12.2" }),
				React.createElement("path", { d: "M8 1.8c1.7 1.8 2.6 3.9 2.6 6.2S9.7 12.4 8 14.2C6.3 12.4 5.4 10.3 5.4 8S6.3 3.6 8 1.8Z" }),
			);
		}

		/**
		 * Full-panel DeepSeek site. The site's own sidebar is the history list;
		 * a right-click menu over its rows deletes the conversation through the
		 * site's own API (two-step confirmation).
		 */
		function DeepSeekPanel() {
			const hostRef = React.useRef(null);
			const viewRef = React.useRef(undefined);
			const [status, setStatus] = React.useState("connecting");
			const [message, setMessage] = React.useState("");

			React.useEffect(() => {
				const carrier = globalThis.dshDesktop;
				const bridge = carrier?.protocolVersion === 1 ? carrier.browser : undefined;
				if (bridge === undefined) {
					setStatus("unsupported");
					return;
				}
				let cancelled = false;
				let lease;
				let element;
				const host = hostRef.current;
				if (host === null) {
					setStatus("error");
					return;
				}

				const installHelper = async () => {
					const view = viewRef.current;
					if (view === undefined || typeof view.executeJavaScript !== "function") return;
					try {
						await view.executeJavaScript(DELETE_HELPER_SCRIPT, true);
					} catch (error) {
						console.warn("[dsh-deepseek-web] right-click helper failed", error);
					}
					try {
						await view.executeJavaScript(SELECTION_SCRIPT, true);
					} catch (error) {
						console.warn("[dsh-deepseek-web] selection helper failed", error);
					}
				};

				const rememberUrl = () => {
					const view = viewRef.current;
					if (view === undefined) return;
					const url = view.getURL();
					if (typeof url === "string" && url.startsWith("https://chat.deepseek.com")) lastUrl = url;
				};

				(async () => {
					const reservation = await bridge.acquire("dsh-deepseek-web-panel");
					if (cancelled) {
						await bridge.release(reservation.lease).catch(() => {});
						return;
					}
					lease = reservation.lease;
					const view = document.createElement("webview");
					element = view;
					viewRef.current = view;
					view.setAttribute("name", reservation.lease);
					view.setAttribute("partition", reservation.partition);
					view.setAttribute("allowpopups", "");
					view.setAttribute("src", "about:blank#" + reservation.lease);
					host.appendChild(view);
					await new Promise((resolve, reject) => {
						view.addEventListener("dom-ready", resolve, { once: true });
						view.addEventListener("destroyed", () => reject(new Error("webview destroyed")), { once: true });
					});
					if (cancelled) return;
					view.addEventListener("did-stop-loading", () => {
						void installHelper();
					});
					for (const name of ["did-navigate", "did-navigate-in-page"]) {
						view.addEventListener(name, rememberUrl);
					}
					await view.loadURL(lastUrl !== "" ? lastUrl : DEEPSEEK_URL);
					if (!cancelled) {
						setStatus("ready");
						void installHelper();
					}
				})().catch((error) => {
					console.warn("[dsh-deepseek-web] panel failed", error);
					if (!cancelled) setStatus("error");
				});

				return () => {
					cancelled = true;
					viewRef.current = undefined;
					if (element !== undefined) {
						element.remove();
						element = undefined;
					}
					if (lease !== undefined) {
						const released = lease;
						lease = undefined;
						bridge.release(released).catch(() => {});
					}
				};
			}, []);

			const flash = (text) => {
				setMessage(text);
				window.setTimeout(() => setMessage(""), 1800);
			};

			const quoteSelection = async () => {
				if (typeof lastSessionId !== "string" || lastSessionId === "") {
					flash("先在左侧打开一个 DSH 会话");
					return;
				}
				const view = viewRef.current;
				if (view === undefined || typeof view.executeJavaScript !== "function") return;
				let text = "";
				try {
					text = await view.executeJavaScript(
						"window.__dshDeepSeekSelection || (window.getSelection ? String(window.getSelection()) : '')",
						true,
					);
				} catch {}
				const cleaned = typeof text === "string" ? text.trim() : "";
				if (cleaned === "") {
					flash("先在网页里选中文字");
					return;
				}
				const ok = await quoteIntoChat(cleaned);
				if (!ok) flash("没有找到输入框，内容已复制到剪贴板");
			};

			return React.createElement(
				"div",
				{ className: "dsh-deepseek-web-panel" },
				// The empty top band that only exists while the sidebar column is
				// hidden: the whole strip (right of the frame controls) drags the window.
				React.createElement("div", { className: "dsh-deepseek-web-drag", title: "拖动窗口" }),
				React.createElement(
					"div",
					{ className: "dsh-deepseek-web-stage" },
					React.createElement("div", { className: "dsh-deepseek-web-host", ref: hostRef }),
					React.createElement(
						"button",
						{
							type: "button",
							className: "dsh-deepseek-web-quote",
							title: "引用选中文字到对话",
							"aria-label": "引用选中文字到对话",
							onClick: quoteSelection,
						},
						"❝",
					),
					message !== ""
						? React.createElement("div", { className: "dsh-deepseek-web-toast" }, message)
						: null,
					status === "ready"
						? null
						: React.createElement(
								"div",
								{ className: "dsh-deepseek-web-status" },
								status === "unsupported"
									? "网页区需要在桌面版客户端中使用"
									: status === "error"
										? "网页加载失败，切换到其它面板再回来即可重试"
										: "正在打开 DeepSeek…",
							),
				),
			);
		}

		/** Required client services: the slot registry and global-panel navigation. */
		const inject = ["slots", "layout", "conversation", "uiSession"];

		/**
		 * Register the center panel and the sidebar entry that selects it.
		 * @param ctx - client root context.
		 */
		function apply(ctx) {
			ensureStyle();
			pluginContext = ctx;

			/** Remember the conversation the panel was opened from. */
			const readCurrentSession = () => {
				try {
					const binding = ctx.uiSession?.current?.getSnapshot?.();
					if (binding !== undefined && typeof binding.key === "string" && binding.key !== "") lastSessionId = binding.key;
				} catch {}
			};
			readCurrentSession();
			ctx.effect(() => {
				const source = ctx.uiSession?.current;
				if (source === undefined) return () => {};
				const dispose = source.subscribe(readCurrentSession);
				readCurrentSession();
				return dispose;
			}, "dsh-deepseek-web: current session");

			const openPanel = () => {
				try {
					ctx.layout.selectPanel(PANEL_ID);
				} catch (error) {
					console.warn("[dsh-deepseek-web] unable to select the panel", error);
				}
			};

			const Action = (props) => {
				const wide = props?.wide === true;
				return React.createElement(
					"button",
					{
						type: "button",
						className: "dsh-deepseek-web-action",
						title: "打开网页区（DeepSeek 网页）",
						"aria-label": "打开网页区",
						onClick: openPanel,
					},
					React.createElement(GlobeIcon, { size: 16 }),
					wide ? React.createElement("span", null, "网页区") : null,
				);
			};

			ctx.slots.inject("main", () =>
				ctx.slots.register({ name: "main", key: PANEL_ID }, DeepSeekPanel),
			);
			ctx.slots.inject("sidebar.footer.action", () =>
				ctx.slots.register(
					{ name: "sidebar.footer.action", id: "dsh-deepseek-web", order: 20 },
					Action,
				),
			);
		}

		exports.apply = apply;
		exports.inject = inject;
		exports.PANEL_ID = PANEL_ID;
		exports.DELETE_HELPER_SCRIPT = DELETE_HELPER_SCRIPT;
		return module.exports;
	},
});
