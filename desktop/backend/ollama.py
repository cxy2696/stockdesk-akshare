"""Local Ollama bridge: model discovery, health and a structured daily read.

The integration is intentionally local-first and conservative:

* Only aggregate market data, model output and the user's position summary are
  sent to the local Ollama instance.  Trade notes and raw history are not.
* The model is asked for a *structured opinion* (stance / position / bullets /
  risks), never for a price target.
* Results are cached for ten minutes and can be refreshed manually.
* If Ollama is not running, every endpoint returns a readable error instead of
  raising, so the page never goes blank.
"""
from __future__ import annotations

import json
import re
import threading
import time
import urllib.error
import urllib.parse
import urllib.request

from . import db

DEFAULT_CONFIG = {
    "enabled": False,
    "host": "http://127.0.0.1:11434",
    "model": "deepseek-r1:8b",
    "temperature": 0.25,
    "timeout": 150,
    "num_predict": 900,
}

_ALLOWED = set(DEFAULT_CONFIG)
_LOCK = threading.Lock()
_ADVICE_KEY = "ollama:advice:v1"
_ADVICE_TTL = 600


def _clean_host(host: str) -> str:
    host = (host or "").strip().rstrip("/")
    if not host:
        return DEFAULT_CONFIG["host"]
    parsed = urllib.parse.urlparse(host)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise ValueError("Ollama 地址需要是 http://host:port")
    return host


def config() -> dict:
    saved = db.get_setting("ollama", {}) or {}
    cfg = dict(DEFAULT_CONFIG)
    for k, v in saved.items():
        if k in _ALLOWED:
            cfg[k] = v
    try:
        cfg["enabled"] = bool(cfg["enabled"])
    except Exception:
        cfg["enabled"] = False
    try:
        cfg["temperature"] = max(0.0, min(1.0, float(cfg["temperature"])))
    except Exception:
        cfg["temperature"] = DEFAULT_CONFIG["temperature"]
    try:
        cfg["timeout"] = int(max(10, min(300, float(cfg["timeout"]))))
    except Exception:
        cfg["timeout"] = DEFAULT_CONFIG["timeout"]
    try:
        cfg["num_predict"] = int(max(128, min(2000, float(cfg["num_predict"]))))
    except Exception:
        cfg["num_predict"] = DEFAULT_CONFIG["num_predict"]
    cfg["host"] = str(cfg["host"]).strip().rstrip("/")
    cfg["model"] = str(cfg["model"]).strip() or DEFAULT_CONFIG["model"]
    return cfg


def save_config(patch: dict) -> dict:
    cfg = config()
    for key in _ALLOWED:
        if key in patch and patch[key] is not None:
            cfg[key] = patch[key]
    cfg["host"] = _clean_host(str(cfg["host"]))
    cfg["model"] = str(cfg["model"]).strip() or DEFAULT_CONFIG["model"]
    cfg["enabled"] = bool(cfg["enabled"])
    cfg["temperature"] = max(0.0, min(1.0, float(cfg["temperature"])))
    cfg["timeout"] = int(max(10, min(300, float(cfg["timeout"]))))
    cfg["num_predict"] = int(max(128, min(2000, float(cfg["num_predict"]))))
    db.set_setting("ollama", cfg)
    return cfg


def _get(path: str, timeout: float = 5.0):
    cfg = config()
    req = urllib.request.Request(cfg["host"] + path, headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8", "ignore"))


def _post(path: str, payload: dict, timeout: float):
    cfg = config()
    req = urllib.request.Request(
        cfg["host"] + path,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json", "Accept": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8", "ignore"))


def health() -> dict:
    cfg = config()
    out = {
        "ok": False,
        "host": cfg["host"],
        "model": cfg["model"],
        "enabled": cfg["enabled"],
        "models": [],
        "model_ready": False,
        "version": None,
        "error": "",
    }
    try:
        tags = _get("/api/tags", timeout=4)
        out["models"] = [m.get("name") for m in (tags.get("models") or []) if m.get("name")]
        out["model_ready"] = cfg["model"] in out["models"]
        out["ok"] = True
    except Exception as e:
        out["error"] = _friendly_error(e)
    try:
        ver = _get("/api/version", timeout=3)
        out["version"] = ver.get("version")
    except Exception:
        pass
    if out["ok"] and not out["model_ready"]:
        out["error"] = f"Ollama 已连接，但没有 {cfg['model']}；先执行 ollama pull {cfg['model']}"
    return out


def models() -> list[str]:
    try:
        tags = _get("/api/tags", timeout=4)
        return [m.get("name") for m in (tags.get("models") or []) if m.get("name")]
    except Exception:
        return []


def _friendly_error(e: Exception) -> str:
    text = str(e)
    if isinstance(e, urllib.error.URLError):
        text = str(e.reason)
    if "Connection refused" in text or "connect" in text.lower():
        return "连接不上 Ollama。先启动 `ollama serve`，或检查设置里的地址。"
    if "timed out" in text.lower() or "timeout" in text.lower():
        return "Ollama 响应超时。换更小的模型，或把超时调大。"
    if "model" in text.lower() and "not found" in text.lower():
        return "模型不存在。先在终端执行 `ollama pull 模型名`。"
    return text[:300] or "Ollama 请求失败"


# ---------------------------------------------------------------------------
# Context / prompt
# ---------------------------------------------------------------------------

def _context() -> dict:
    from . import advice, daily, models as models_lib, portfolio

    brief = daily.daily_brief()
    snap = models_lib.model_snapshot()
    summary = portfolio.summary()
    adv = advice.position_advice()
    model = brief.get("model") or {}
    hmm = model.get("hmm") or {}
    perc = model.get("percolation") or {}
    td = model.get("td") or {}
    ensemble = model.get("ensemble") or {}
    return {
        "as_of": brief.get("date"),
        "market": {
            "summary": brief.get("summary"),
            "score": brief.get("score"),
            "verdict": (brief.get("verdict") or {}).get("label"),
            "breadth": {
                "up": (brief.get("breadth") or {}).get("up"),
                "down": (brief.get("breadth") or {}).get("down"),
                "limit_up": (brief.get("breadth") or {}).get("limit_up"),
                "limit_down": (brief.get("breadth") or {}).get("limit_down"),
            },
            "turnover_yi": round((brief.get("turnover") or 0) / 1e8, 0),
            "indices": [
                {
                    "name": i.get("short") or i.get("name"),
                    "pct": i.get("pct"),
                    "ma20": i.get("ma20"),
                    "rsi": i.get("rsi"),
                    "td": (i.get("td") or {}).get("label"),
                }
                for i in (brief.get("indices") or [])
            ],
            "sectors_top": [x.get("name") for x in (brief.get("sectors") or {}).get("top", [])][:5],
            "sectors_bottom": [x.get("name") for x in (brief.get("sectors") or {}).get("bottom", [])][:3],
        },
        "models": {
            "hmm": {
                "state": hmm.get("state"),
                "confidence": hmm.get("confidence"),
                "expected_days": hmm.get("expected_days"),
                "age": hmm.get("regime_age"),
                "flip_risk": hmm.get("flip_risk"),
                "summary": hmm.get("summary"),
            },
            "percolation": {
                "status": perc.get("status"),
                "giant_occupied": perc.get("giant_occupied"),
                "ratio": perc.get("ratio"),
                "clusters": perc.get("clusters"),
                "note": perc.get("note"),
            },
            "td": {"counts": td.get("counts"), "text": td.get("text")},
            "ensemble": ensemble,
            "industry_focus": [
                {"name": x.get("name"), "status": x.get("status"), "focus": x.get("focus")}
                for x in (model.get("industry_focus") or [])[:6]
            ],
        },
        "portfolio": {
            "total": summary.get("total"),
            "cash_pct": summary.get("cash_pct"),
            "position_pct": summary.get("position_pct"),
            "total_pct": summary.get("total_pct"),
            "positions": [
                {
                    "name": p.get("name"),
                    "code": p.get("code"),
                    "weight": p.get("weight"),
                    "float_pct": p.get("float_pct"),
                    "today_pnl": p.get("today_pnl"),
                }
                for p in (summary.get("positions") or [])[:8]
            ],
            "advice": {
                "action": adv.get("action"),
                "target": f"{adv.get('target_low')}%–{adv.get('target_high')}%",
                "headline": adv.get("headline"),
                "warnings": adv.get("warnings"),
            },
        },
        "news": [n.get("title") for n in (brief.get("news") or [])[:6]],
        "model_version": (snap.get("model_meta") or {}).get("registry_version"),
    }


SYSTEM_PROMPT = """你是运行在用户本机的个人交易台研究助手，不是投资顾问。
只使用用户提供的数据，不编造新闻、价格或基本面；不预测具体点位。
用中文短句，具体数字，语气像交易笔记，不要空话。给出 1–3 个交易日或 1–2 周的倾向。
只输出一个 JSON 对象，不要 Markdown 代码块。字段：
stance: 进攻|均衡偏多|中性|均衡偏防守|防守
position: 例如 "35%–55%"
horizon: "1–3 个交易日" 或 "1–2 周"
confidence: 0–100 的整数
summary: 80–160 字，先结论后依据
bullets: 3–5 条，包含具体数字
risks: 2–3 条
actions: 2–4 条可执行动作
watch: 2–5 个行业或股票名称
"""


def _user_prompt(ctx: dict) -> str:
    return (
        "请根据下面的本地数据给出今天到未来两周的判断。\n"
        "要求：仓位建议必须落在 0%–90%；不要给出股价目标；如果数据缺失就直说。\n\n"
        + json.dumps(ctx, ensure_ascii=False, default=str, separators=(",", ":"))[:7000]
    )


def _norm_stance(value) -> str:
    text = str(value or "").strip()
    if "进攻" in text or "加仓" in text:
        return "进攻"
    if "偏防守" in text or "减仓" in text:
        return "均衡偏防守"
    if "防守" in text:
        return "防守"
    if "偏多" in text:
        return "均衡偏多"
    if "中性" in text or "震荡" in text or "观望" in text:
        return "中性"
    return ""


def _parse(text: str, fallback: dict | None = None) -> dict:
    raw = (text or "").strip()
    cleaned = re.sub(r"^```(?:json)?|```$", "", raw, flags=re.MULTILINE).strip()
    start, end = cleaned.find("{"), cleaned.rfind("}")
    if start >= 0 and end > start:
        cleaned = cleaned[start:end + 1]
    fallback = fallback or {}
    try:
        data = json.loads(cleaned)
    except Exception:
        return {
            "stance": fallback.get("stance") or "中性",
            "position": fallback.get("position") or "--",
            "horizon": "1–3 个交易日",
            "confidence": 50,
            "summary": raw[:600] or "模型没有返回内容。",
            "bullets": [],
            "risks": [],
            "actions": [],
            "watch": [],
            "parse_error": True,
        }
    def strings(key, limit):
        v = data.get(key) or []
        if isinstance(v, str):
            v = [v]
        return [str(x).strip() for x in v if str(x).strip()][:limit]
    try:
        confidence = int(float(data.get("confidence", 50)))
    except Exception:
        confidence = 50
    stance = _norm_stance(data.get("stance")) or fallback.get("stance") or "中性"
    position = str(data.get("position") or "").strip()
    if not re.search(r"\d+\s*%", position):
        position = fallback.get("position") or "--"
    return {
        "stance": stance,
        "position": position[:20],
        "horizon": str(data.get("horizon") or "1–3 个交易日")[:20],
        "confidence": max(0, min(100, confidence)),
        "summary": str(data.get("summary") or "")[:800],
        "bullets": strings("bullets", 6),
        "risks": strings("risks", 4),
        "actions": strings("actions", 5),
        "watch": strings("watch", 6),
        "parse_error": False,
    }


def advice(force: bool = False, cached_only: bool = False) -> dict:
    cfg = config()
    base = {
        "enabled": cfg["enabled"],
        "host": cfg["host"],
        "model": cfg["model"],
        "generated_at": None,
        "latency_ms": None,
        "cached": False,
        "available": False,
        "error": "",
        "advice": None,
        "context": None,
    }
    if not cfg["enabled"]:
        base["error"] = "Ollama 辅助判断未启用。到设置里打开，并选择本地模型。"
        return base
    key = f"{_ADVICE_KEY}:{cfg['model']}"
    if cached_only:
        cached = db.cache_get(key, 86400 * 7)
        if cached:
            cached = dict(cached)
            cached["cached"] = True
            return cached
        base["error"] = "还没有生成过判断，点“生成判断”让本地模型跑一次。"
        base["needs_generate"] = True
        return base
    if not force:
        cached = db.cache_get(key, _ADVICE_TTL)
        if cached:
            cached = dict(cached)
            cached["cached"] = True
            return cached
    with _LOCK:
        if not force:
            cached = db.cache_get(key, _ADVICE_TTL)
            if cached:
                cached = dict(cached)
                cached["cached"] = True
                return cached
        try:
            ctx = _context()
        except Exception as e:
            base["available"] = False
            base["error"] = f"准备上下文失败：{e}"
            return base
        started = time.time()
        try:
            resp = _post(
                "/api/chat",
                {
                    "model": cfg["model"],
                    "messages": [
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {"role": "user", "content": _user_prompt(ctx)},
                        # DeepSeek-R1 otherwise spends the whole output budget
                        # on chain-of-thought.  Prefilling the opening brace
                        # makes it continue with the JSON object directly.
                        {"role": "assistant", "content": "{"},
                    ],
                    "stream": False,
                    "format": "json",
                    "options": {
                        "temperature": cfg["temperature"],
                        "num_predict": cfg["num_predict"],
                    },
                },
                timeout=cfg["timeout"],
            )
        except Exception as e:
            base["error"] = _friendly_error(e)
            return base
        latency = int((time.time() - started) * 1000)
        content = ((resp.get("message") or {}).get("content") or "").strip()
        if content and not content.lstrip().startswith("{"):
            content = "{" + content
        parsed = _parse(content, (ctx.get("models") or {}).get("ensemble") or {})
        result = {
            **base,
            "available": True,
            "generated_at": time.time(),
            "latency_ms": latency,
            "advice": parsed,
            "baseline": (ctx.get("models") or {}).get("ensemble") or {},
            "context": {
                "as_of": ctx.get("as_of"),
                "score": (ctx.get("market") or {}).get("score"),
                "verdict": (ctx.get("market") or {}).get("verdict"),
                "hmm": (ctx.get("models") or {}).get("hmm", {}).get("state"),
                "percolation": (ctx.get("models") or {}).get("percolation", {}).get("status"),
                "position_pct": (ctx.get("portfolio") or {}).get("position_pct"),
            },
            "raw": content[:4000],
        }
        db.cache_set(key, result)
        return result
