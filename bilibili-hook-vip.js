// ==UserScript==
// @name          bilibili-hook-vip
// @description   共享大会员 修改于PC6live的bilibili-joybook，免登陆带会员的账号，直接输入Cookie
// @author        PeterGang
// @namespace     https://github.com/GangPeter
// @match         *://*.bilibili.com/*
// @exclude       *://passport.bilibili.com/*
// @license       MIT
// @grant         GM_setValue
// @grant         GM_getValue
// @grant         GM_xmlhttpRequest
// @grant         GM_registerMenuCommand
// @grant         unsafeWindow
// @run-at        document-start
// @noframes      true
// @connect       bilibili.com
// @version       0.0.1
// ==/UserScript==
(function () {
    'use strict';
    function __awaiter(thisArg, _arguments, P, generator) {
        function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
        return new (P || (P = Promise))(function (resolve, reject) {
            function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
            function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
            function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
            step((generator = generator.apply(thisArg, _arguments || [])).next());
        });
    }
    typeof SuppressedError === "function" ? SuppressedError : function (error, suppressed, message) {
        var e = new Error(message);
        return e.name = "SuppressedError", e.error = error, e.suppressed = suppressed, e;
    };
    const REAL_XHR = "_xhr";
    function setConfig(target, p, args) {
        if (p === "open") {
            target.method = args[0];
            target.url = args[1];
            target.async = args[2];
            target.user = args[3];
            target.password = args[4];
        }
        if (p === "send") {
            target.body = args[0];
        }
        if (p === "setRequestHeader") {
            target.headers = {};
            target.headers[args[0].toLowerCase()] = args[1];
        }
    }
    function proxy(options, win) {
        // 保存真实 XMLHttpRequest
        win[REAL_XHR] = win[REAL_XHR] || win.XMLHttpRequest;
        win.XMLHttpRequest = new Proxy(win.XMLHttpRequest, {
            construct(Target) {
                // 代理 new 操作符
                const xhr = new Target();
                const xhrProxy = new Proxy(xhr, {
                    get: getterFactory,
                    set: setterFactory,
                });
                return xhrProxy;
            },
        });
        const getterFactory = (target, p, receiver) => {
            const value = Reflect.get(target, p);
            const hook = Reflect.get(options, p);
            // 拦截函数
            if (hook && typeof hook === "function")
                return (...args) => {
                    setConfig(target, p.toString(), args);
                    return hook(target, value, receiver) || value.call(target, ...args);//去广告插件可能会报错误
                };
            if (typeof value === "function")
                return value.bind(target);
            // 使用缓存值
            return Reflect.get(target, `_${p.toString()}`) || value;
        };
        const setterFactory = (target, p, value, receiver) => {
            const hook = Reflect.get(options, p);
            if (hook && typeof hook === "function")
                return Reflect.set(target, p, () => {
                    hook(target, value, receiver) || value(target);
                });
            return Reflect.set(target, p, typeof value === "function" ? value.bind(target) : value);
        };
    }
    const proxyUrls = [
        // 视频信息
        "api.bilibili.com/x/player/wbi/playurl",
        // 用户信息
        "api.bilibili.com/x/player/wbi/v2",
        // bangumi 信息
        "api.bilibili.com/pgc/player/web/v2/playurl",
    ];
    // 需要代理的链接
    const handleUrl = (url) => {
        if (!GM_getValue('vipCookie'))
            return false;
        if (proxyUrls.findIndex((v) => url.includes(v)) > -1)
            return true;
        return false;
    };
    function handleResponse(xhr) {
        return __awaiter(this, void 0, void 0, function* () {
            const url = new URL(xhr.url, window.location.href);
            xhr.url = url.href;
            // 使用vip账号获取数据
            const request = yield GM.xmlHttpRequest({
                method: xhr.method,
                url: xhr.url,
                anonymous: true,
                cookie: GM_getValue('vipCookie'),
                headers: {
                    referer: window.location.href,
                },
            }).catch((e) => console.error(e));
            if (!request)
                return;
            // 重新打开链接
            xhr.open(xhr.method, xhr.url, xhr.async !== false, xhr.user, xhr.password);
            for (const key in xhr.headers) {
                xhr.setRequestHeader(key, xhr.headers[key]);
            }
            // 替换必要的数据
            // TODO: catch 数据结构变化输出错误
            xhr.onreadystatechange = () => {
                if (xhr.readyState === 4) {
                    const originResponse = JSON.parse(xhr.response);
                    const proxyResponse = JSON.parse(request.response);
                    // video
                    if (xhr.url.includes(proxyUrls[0]))
                        originResponse.data = proxyResponse.data;
                    // response 中包含上次播放时间
                    if (xhr.url.includes(proxyUrls[1]))
                        originResponse.data.vip = proxyResponse.data.vip;
                    // bangumi
                    if (xhr.url.includes(proxyUrls[2]))
                        originResponse.result = proxyResponse.result;
                    xhr._responseText = JSON.stringify(originResponse);
                }
            };
            // 发送链接
            xhr.send(xhr.body);
        });
    }
    function listenerAjax() {
        const config = {
            open(xhr) {
                if (handleUrl(xhr.url)) {
                    handleResponse(xhr);
                    return true;
                }
                return false;
            },
            send(xhr) {
                if (handleUrl(xhr.url))
                    return true;
                return false;
            },
            setRequestHeader(xhr) {
                if (handleUrl(xhr.url))
                    return true;
                return false;
            },
        };
        proxy(config, unsafeWindow);
    }
    const promptCookieInput = () => {
        const cookie = prompt("Bilibili 大会员共享:直接复制全部 Cookie");
        let newCookie = '';
        if (cookie) {
            for (const cookieValue of cookie.split(';'))
                if (["SESSDATA", "DedeUserID", "DedeUserID__ckMd5", "bili_jct"].includes(cookieValue.split('=')[0]))
                    newCookie += (cookieValue + ';');
            GM_setValue("vipCookie", newCookie.slice(0, -1));
        }
        location.reload();
    };
    GM_registerMenuCommand("重设大会员 Cookie", promptCookieInput);
    (() => {
        if (!GM_getValue("vipCookie")) {
            promptCookieInput();
            return;
        }
        listenerAjax();// 监听XHR
    })();
})();