"""金十数据 MCP（官方授权、免费额度 1500次/工具/天）。

来源性质说明（与"二手聚合站一律不作为数据源"的关系）：
本项目 2026-08-17 事故的教训是"二手站回收旧数据且无法验证"。金十此前被否决是因为
财经日历在登录墙后、页面明文禁止未授权使用。**2026-09-01 起改用其官方 MCP 开放平台**
（mcp.jin10.com），带 Token 的授权接入，不是爬取——授权问题解除。
但它仍是转发方而非发布方，因此：
  ✅ 现货报价(XAUUSD/UKOIL 等)：可进判定层，但必须与既有官方源交叉校验
  ✅ 财经日历的 previous/consensus/actual：可用于展示与"预期差"
  ⚠️ 快讯/资讯：只作事件通报，不从中读取任何数字
  ❌ 不作为任何官方统计口径的替代（GDP/CPI/就业等一律仍走 FRED 一手）

解决的四个既有缺口：
  ① XAUUSD 现货金——FRED 的 LBMA 定盘价已停更、yfinance 无现货代码、Stooq 404
  ② UKOIL 布伦特——yfinance 周日夜盘K线 OHLC 违例（高<开），方向都是反的
  ③ 日历「实际值」——ForexFactory 免费feed 只有预期/前值，没有实际
  ④ 中文地缘快讯——原词表把 "Global Strike Command" 误判为地缘链

协议：标准 MCP over HTTP（JSON-RPC 2.0）。
  initialize → notifications/initialized → tools/call
  结果优先取 result.structuredContent（content 只是可读文本补充）
  响应需显式 r.encoding="utf-8"，否则中文乱码
"""
from __future__ import annotations

import json
import os

import requests

URL = "https://mcp.jin10.com/mcp"
PROTOCOL = "2025-11-25"
# 常用品种代码（quote://codes 可列全量）
CODES = {
    "xauusd": "XAUUSD",   # 现货黄金
    "xagusd": "XAGUSD",   # 现货白银
    "ukoil": "UKOIL",     # 布伦特原油
    "usoil": "USOIL",     # WTI原油
    "usdjpy": "USDJPY",
    "usdcnh": "USDCNH",
    "copper": "COPPER",
}


class Jin10:
    """一个会话复用一个连接，减少握手开销（每工具每天1500次额度要省着用）。"""

    def __init__(self, token: str | None = None, timeout: int = 30):
        self.token = token or os.environ.get("JIN10_MCP_TOKEN") or ""
        self.timeout = timeout
        self._id = 0
        self._ready = False
        self.s = requests.Session()
        self.s.headers.update({
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
            "Authorization": f"Bearer {self.token}",
        })

    def _rpc(self, method: str, params: dict | None = None) -> dict:
        self._id += 1
        body = {"jsonrpc": "2.0", "id": self._id, "method": method}
        if params is not None:
            body["params"] = params
        r = self.s.post(URL, json=body, timeout=self.timeout)
        r.encoding = "utf-8"          # 不设会中文乱码
        r.raise_for_status()
        t = r.text
        if "data: " in t[:200]:       # SSE 包装
            t = "\n".join(l[6:] for l in t.splitlines() if l.startswith("data: "))
        return json.loads(t)

    def _ensure(self) -> None:
        if self._ready:
            return
        if not self.token:
            raise RuntimeError("missing JIN10_MCP_TOKEN")
        self._rpc("initialize", {
            "protocolVersion": PROTOCOL, "capabilities": {},
            "clientInfo": {"name": "macro-alert", "version": "2.0"}})
        self.s.post(URL, json={"jsonrpc": "2.0", "method": "notifications/initialized"},
                    timeout=self.timeout)
        self._ready = True

    def call(self, tool: str, args: dict | None = None) -> dict:
        """调用一个工具，返回 structuredContent。业务错误抛 RuntimeError。"""
        self._ensure()
        j = self._rpc("tools/call", {"name": tool, "arguments": args or {}})
        if "error" in j:
            raise RuntimeError(f"jin10 rpc error: {str(j['error'])[:120]}")
        res = j.get("result") or {}
        if res.get("isError"):
            txt = (res.get("content") or [{}])[0].get("text", "")
            raise RuntimeError(f"jin10 tool error: {txt[:120]}")
        return res.get("structuredContent") or res

    # ── 便捷封装 ────────────────────────────────────────────
    def quote(self, code: str) -> dict:
        """实时报价。返回 {code,name,time,open,close,high,low,volume,ups_price,ups_percent}"""
        return (self.call("get_quote", {"code": code}) or {}).get("data") or {}

    def calendar(self) -> list[dict]:
        """财经日历。每项 {pub_time,star,title,previous,consensus,actual,revised,affect_txt}
        注意：list_calendar 不接受任何额外参数（传 cursor/days 都会被拒）。"""
        d = (self.call("list_calendar", {}) or {}).get("data")
        return d if isinstance(d, list) else []

    def search_flash(self, keyword: str) -> list[dict]:
        """按关键词搜快讯（中文一手事件通报，不取数字）。"""
        d = (self.call("search_flash", {"keyword": keyword}) or {}).get("data") or {}
        return d.get("items") or []
