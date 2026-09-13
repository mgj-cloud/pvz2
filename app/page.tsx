"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, Atom, Clock3, Eraser, FastForward, FlaskConical, Grid3X3, Info, MousePointer2, Play, RotateCcw, Sparkles, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";

type MapId = "egypt" | "future";
type Strategy = "costume" | "split";
type PlantId = "ball" | "doom" | "snake" | "mandrake" | "burdock" | "lotus" | "coin" | "heart";
type ToolId = PlantId | "tile" | "erase";
type DoomSize = "small" | "medium" | "large";
type Board = Record<string, { type: PlantId; doomSize?: DoomSize }>;
type Feed = { id: number; at: number; cell: string };
type Lane = "操作" | "瓷砖" | "巨人" | "中小怪" | "系统";
type Event = { at: number; lane: Lane; title: string; detail: string; confidence: "confirmed" | "estimated"; tone: string };

const plants: Record<PlantId, { name: string; short: string; color: string }> = {
  ball: { name: "球果", short: "球", color: "#f7b84b" },
  doom: { name: "毁灭菇", short: "毁", color: "#9b7cff" },
  snake: { name: "蛇草·装扮", short: "蛇", color: "#55dfb2" },
  mandrake: { name: "曼德拉", short: "曼", color: "#5dc8ff" },
  burdock: { name: "牛蒡", short: "牛", color: "#ff835f" },
  lotus: { name: "飞莲", short: "莲", color: "#f779c6" },
  coin: { name: "铜钱草", short: "铜", color: "#c4d96b" },
  heart: { name: "心叶兰", short: "心", color: "#fb6685" },
};
const initialBoard: Board = {
  "1-6": { type: "mandrake" }, "2-5": { type: "heart" }, "2-6": { type: "doom", doomSize: "large" },
  "2-7": { type: "snake" }, "3-2": { type: "ball" }, "3-6": { type: "burdock" },
  "4-5": { type: "lotus" }, "4-6": { type: "doom", doomSize: "small" }, "5-6": { type: "mandrake" },
};
const initialTiles = new Set(["3-2", "1-6", "2-6", "2-7", "4-6", "5-6"]);
const lanes: Lane[] = ["操作", "瓷砖", "巨人", "中小怪", "系统"];
const keyOf = (r: number, c: number) => `${r}-${c}`;
const parseKey = (key: string) => key.split("-").map(Number) as [number, number];
const ms = (n: number) => `${Math.round(n).toLocaleString("zh-CN")} ms`;

function distanceDelay(from: string, to: string) {
  const [a, b] = parseKey(from), [c, d] = parseKey(to);
  return 2000 + 200 * Math.sqrt((a - c) ** 2 + (b - d) ** 2);
}
function near(a: string, b: string) {
  const [r, c] = parseKey(a), [x, y] = parseKey(b);
  return Math.abs(r - x) <= 1 && Math.abs(c - y) <= 1;
}
function boostAt(board: Board, target: string) {
  const targetPlant = board[target];
  if (!targetPlant || (targetPlant.type !== "doom" && targetPlant.type !== "snake")) return 0;
  let boost = 0;
  for (const [cell, plant] of Object.entries(board)) {
    if (plant.type === "coin" && near(cell, target)) boost = Math.max(boost, .2);
    if (plant.type === "lotus" && near(cell, target)) boost = Math.max(boost, .9);
    if (plant.type === "heart") {
      const [r, c] = parseKey(cell);
      if (target === keyOf(r, c + 1)) boost = Math.max(boost, 1);
    }
  }
  return boost;
}
function splitTargets(board: Board, tiles: Set<string>, parent: string, size: DoomSize = "small") {
  if (size === "small") return [];
  const [pr, pc] = parseKey(parent);
  const priorities = [
    [-2,-2,24],[-2,-1,23],[-2,0,22],[-2,1,21],[-2,2,20],
    [-1,-2,19],[-1,-1,18],[-1,0,17],[-1,1,16],[-1,2,15],
    [0,-2,14],[0,-1,13],[0,1,12],[0,2,11],
    [1,-2,10],[1,-1,9],[1,0,8],[1,1,7],[1,2,6],
    [2,-2,5],[2,-1,4],[2,0,3],[2,1,2],[2,2,1],
  ];
  const radius = size === "large" ? 2 : 1;
  return priorities
    .filter(([dr, dc]) => Math.abs(dr) <= radius && Math.abs(dc) <= radius)
    .map(([dr, dc, priority]) => ({ cell: keyOf(pr + dr, pc + dc), priority }))
    .filter(({ cell }) => {
      const [r, c] = parseKey(cell);
      return r >= 1 && r <= 5 && c >= 1 && c <= 9 && !board[cell] && !tiles.has(cell);
    })
    .sort((a, b) => b.priority - a.priority)
    .slice(0, size === "large" ? 2 : 1);
}
function plantEvents(plant: Board[string], cell: string, at: number, board: Board, tiles: Set<string>, map: MapId, strategy: Strategy, source: string): Event[] {
  const boost = boostAt(board, cell), factor = 1 + boost, sourceLane = source === "瓷砖" ? "瓷砖" : "操作";
  const accel = boost ? `取最高加速 +${boost * 100}%` : "无加速";
  if (plant.type === "doom") {
    const growing = strategy === "costume" && plant.doomSize !== "large";
    const windup = Math.round((growing ? 2633 : 667) / factor);
    const result: Event[] = [
      { at, lane: sourceLane, title: `${cell} 毁灭菇启动`, detail: `${plant.doomSize === "large" ? "大" : plant.doomSize === "medium" ? "中" : "小"}体型 · ${strategy === "costume" ? "装扮" : "无装扮"} · ${accel}`, confidence: "confirmed", tone: "violet" },
      { at: at + windup, lane: "巨人", title: "毁灭菇爆炸", detail: `${cell} · 前摇 ${ms(windup)} · 巨人进入辐射搬运态`, confidence: boost === 0 || boost === 1 ? "confirmed" : "estimated", tone: "red" },
      { at: at + windup + 1, lane: "巨人", title: "球果法阵搬运至 9-3", detail: "仅当法阵有效且巨人处于可搬运状态", confidence: "confirmed", tone: "amber" },
      { at: at + windup + 8000, lane: "系统", title: `${cell} 辐射消失`, detail: "原格约 2666ms 可补毁菇；其他卡 15s 后可种", confidence: "confirmed", tone: "green" },
    ];
    if (strategy === "split") {
      const targets = splitTargets(board, tiles, cell, plant.doomSize);
      if (targets.length) result.splice(3, 0, { at: at + windup, lane: "系统", title: "子菇分裂落位", detail: targets.map(x => `${x.cell}(优先级 ${x.priority})`).join("、"), confidence: "estimated", tone: "violet" });
    }
    return result;
  }
  if (plant.type === "snake") {
    const windup = Math.round(500 / factor);
    return [
      { at, lane: sourceLane, title: `${cell} 蛇草启动`, detail: `默认五阶装扮 · ${accel}`, confidence: "confirmed", tone: "green" },
      { at: at + windup, lane: "巨人", title: "蛇草石化判定", detail: `${cell} · 前摇 ${ms(windup)} · 检查 9-3`, confidence: boost === 0 || boost === 1 ? "confirmed" : "estimated", tone: "green" },
    ];
  }
  if (plant.type === "mandrake") {
    const windup = Math.round(200 / factor), width = map === "egypt" ? 82 : 92;
    return [
      { at: at + windup, lane: "中小怪", title: `${cell} 曼德拉子弹发射`, detail: `前摇 ${ms(windup)} · 双速 680px/s · 碰撞宽 ${width}px`, confidence: boost === 0 || boost === 1 ? "confirmed" : "estimated", tone: "cyan" },
      { at: at + windup + width / 680 * 1000, lane: "中小怪", title: "曼德拉碰撞窗口结束", detail: `${map === "egypt" ? "埃及 32px" : "未来 42px"} 僵尸，按静止目标估算`, confidence: "estimated", tone: "cyan" },
    ];
  }
  if (plant.type === "burdock") {
    const duration = map === "egypt" ? 291.5 : 301.5;
    return [
      { at, lane: sourceLane, title: `${cell} 牛蒡预过波`, detail: "先清中小怪，再由曼德拉续火力；建议关闭二次点燃基因", confidence: "confirmed", tone: "amber" },
      { at: at + duration, lane: "中小怪", title: "牛蒡碰撞窗口结束", detail: `联合弹体约 259.5px · 双速 1000px/s · ${duration}ms`, confidence: "estimated", tone: "amber" },
    ];
  }
  return [];
}
function simulate(board: Board, tiles: Set<string>, feeds: Feed[], map: MapId, strategy: Strategy) {
  const events: Event[] = [
    { at: 0, lane: "操作", title: "球果喂豆｜本关计时起点", detail: "t=0 取关内第一次喂豆输入", confidence: "confirmed", tone: "amber" },
    { at: 900, lane: "系统", title: "球果法阵生成", detail: "开始搬运毁灭菇处理后的巨人，固定落点 9-3", confidence: "confirmed", tone: "amber" },
    { at: 15000, lane: "系统", title: "球果法阵结束", detail: "持续时间按 15s 计", confidence: "confirmed", tone: "red" },
  ];
  const ball = Object.keys(board).find(k => board[k].type === "ball") ?? "3-2";
  tiles.forEach(cell => {
    const plant = board[cell];
    if (!plant || plant.type === "ball") return;
    const at = distanceDelay(ball, cell);
    events.push({ at, lane: "瓷砖", title: `${cell} 瓷砖联动`, detail: "T = 2000 + 200×欧氏距离；内部保留小数", confidence: "confirmed", tone: "violet" });
    events.push(...plantEvents(plant, cell, at, board, tiles, map, strategy, "瓷砖"));
  });
  feeds.forEach(feed => board[feed.cell] && events.push(...plantEvents(board[feed.cell], feed.cell, feed.at, board, tiles, map, strategy, "手动")));
  return events.sort((a, b) => a.at - b.at || a.title.localeCompare(b.title));
}
function timing(events: Event[]) {
  const booms = events.filter(e => e.title === "毁灭菇爆炸"), snakes = events.filter(e => e.title === "蛇草石化判定");
  if (!booms.length || !snakes.length) return { text: "缺少毁菇或蛇草事件", kind: "idle" };
  let gap = Infinity;
  booms.forEach(b => snakes.forEach(s => { if (s.at >= b.at) gap = Math.min(gap, s.at - b.at); }));
  if (!Number.isFinite(gap)) return { text: "蛇草全部早于爆炸｜时序失败", kind: "bad" };
  if (gap >= 16 && gap <= 33) return { text: `对齐 ${Math.round(gap)}ms｜理想窗口`, kind: "good" };
  return { text: `间隔 ${Math.round(gap)}ms｜${gap < 16 ? "过紧" : "时序偏长"}`, kind: "warn" };
}

export default function Home() {
  const [map, setMap] = useState<MapId>("egypt"), [strategy, setStrategy] = useState<Strategy>("costume");
  const [board, setBoard] = useState<Board>(initialBoard), [tiles, setTiles] = useState<Set<string>>(initialTiles);
  const [tool, setTool] = useState<ToolId>("doom"), [doomSize, setDoomSize] = useState<DoomSize>("large");
  const [selected, setSelected] = useState("2-7"), [feedAt, setFeedAt] = useState(2675);
  const [dragging, setDragging] = useState<string | null>(null);
  const [feeds, setFeeds] = useState<Feed[]>([{ id: 1, at: 2675, cell: "2-7" }]);
  const [filter, setFilter] = useState<Lane | "全部">("全部");
  const events = useMemo(() => simulate(board, tiles, feeds, map, strategy), [board, tiles, feeds, map, strategy]);
  const shown = filter === "全部" ? events : events.filter(e => e.lane === filter);
  const result = useMemo(() => timing(events), [events]);

  const reset = () => { setBoard(initialBoard); setTiles(new Set(initialTiles)); setFeeds([{ id: Date.now(), at: 2675, cell: "2-7" }]); setFeedAt(2675); setSelected("2-7"); };
  const useCell = (cell: string) => {
    setSelected(cell);
    if (tool === "tile") return setTiles(old => { const next = new Set(old); next.has(cell) ? next.delete(cell) : next.add(cell); return next; });
    if (tool === "erase") {
      setBoard(old => { const next = { ...old }; delete next[cell]; return next; });
      return setTiles(old => { const next = new Set(old); next.delete(cell); return next; });
    }
    setBoard(old => ({ ...old, [cell]: { type: tool, ...(tool === "doom" ? { doomSize } : {}) } }));
  };
  const movePlant = (target: string) => {
    if (!dragging || dragging === target || !board[dragging]) return setDragging(null);
    setBoard(old => {
      const next = { ...old }, sourcePlant = old[dragging], targetPlant = old[target];
      next[target] = sourcePlant;
      if (targetPlant) next[dragging] = targetPlant;
      else delete next[dragging];
      return next;
    });
    setSelected(target);
    setDragging(null);
  };
  const addFeed = useCallback((cell = selected, at = feedAt) => {
    const plant = board[cell];
    if (!plant || !["doom", "snake", "mandrake", "burdock"].includes(plant.type)) return false;
    setFeeds(old => [...old, { id: Date.now() + Math.random(), at: Math.max(0, at), cell }]);
    return true;
  }, [board, feedAt, selected]);

  useEffect(() => {
    const context = (document as Document & { modelContext?: { registerTool: (tool: Record<string, unknown>, options?: { signal?: AbortSignal }) => void | Promise<void> } }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    void Promise.resolve(context.registerTool({
      name: "add_manual_plant_food_event", title: "添加手动喂豆事件",
      description: "给棋盘指定坐标的毁灭菇、蛇草、曼德拉或牛蒡添加手动喂豆并重算时间轴。",
      inputSchema: { type: "object", properties: { cell: { type: "string", pattern: "^[1-5]-[1-9]$" }, atMs: { type: "number", minimum: 0 } }, required: ["cell", "atMs"], additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute(input: unknown) {
        const value = input as { cell?: string; atMs?: number };
        if (!value.cell || typeof value.atMs !== "number" || !addFeed(value.cell, value.atMs)) throw new Error("坐标、时间或植物类型无效");
        return { added: true, cell: value.cell, atMs: value.atMs };
      },
    }, { signal: lifecycle.signal })).catch(() => undefined);
    return () => lifecycle.abort();
  }, [addFeed]);

  return <main>
    <header className="topbar">
      <div className="mark"><Atom /></div><div><h1>毁蛇阵时序实验室</h1><p>PVZ2 中国版 · 毫秒级事件模拟器 v0.1</p></div>
      <div className="head-controls">
        <label><span>地图</span><NativeSelect value={map} onChange={e => setMap(e.target.value as MapId)}><NativeSelectOption value="egypt">神秘埃及 · 32px</NativeSelectOption><NativeSelectOption value="future">遥远未来 · 42px</NativeSelectOption></NativeSelect></label>
        <label><span>毁菇策略</span><NativeSelect value={strategy} onChange={e => setStrategy(e.target.value as Strategy)}><NativeSelectOption value="costume">装扮 · 体型时差</NativeSelectOption><NativeSelectOption value="split">无装扮 · 子菇连炸</NativeSelectOption></NativeSelect></label>
        <Button variant="outline" onClick={reset}><RotateCcw />重置示例</Button>
      </div>
    </header>
    <section className="status"><div><i />实时重算</div><div><Clock3 />t=0 球果喂豆</div><div><Grid3X3 />5 × 9</div><div className={`timing ${result.kind}`}><Activity />{result.text}</div></section>
    <div className="workspace">
      <section className="board-panel">
        <div className="heading"><div><em>FORMATION</em><h2>阵型与联动瓷砖</h2></div><p><b /> 能量瓷砖　<span /> 受加速</p></div>
        <div className={`lawn ${map}`}>
          <div className="row-nums">{[1,2,3,4,5].map(n => <span key={n}>{n}</span>)}</div>
          <div><div className="col-nums">{[1,2,3,4,5,6,7,8,9].map(n => <span key={n}>{n}</span>)}</div><div className="game-grid">
            {Array.from({ length: 45 }, (_, i) => {
              const cell = keyOf(Math.floor(i / 9) + 1, i % 9 + 1), plant = board[cell], boost = plant ? boostAt(board, cell) : 0;
              return <button key={cell} className={`cell ${tiles.has(cell) ? "tiled" : ""} ${selected === cell ? "selected" : ""} ${dragging === cell ? "dragging" : ""}`} onClick={() => useCell(cell)} draggable={!!plant} onDragStart={() => setDragging(cell)} onDragOver={e => e.preventDefault()} onDrop={() => movePlant(cell)} onDragEnd={() => setDragging(null)} aria-label={`${cell} ${plant ? plants[plant.type].name : "空格"}`}>
                {tiles.has(cell) && <Zap className="tile-glyph" />}
                {plant && <span className="plant" style={{ "--plant": plants[plant.type].color } as React.CSSProperties}><strong>{plants[plant.type].short}</strong>{plant.type === "doom" && <small>{plant.doomSize === "large" ? "大" : plant.doomSize === "medium" ? "中" : "小"}</small>}</span>}
                {boost > 0 && <sup>+{boost * 100}%</sup>}
              </button>;
            })}
          </div></div>
          <div className="spawn">僵尸入口<FastForward /></div>
        </div>
        <div className="palette"><p><MousePointer2 />点击工具再点草坪；拖动已有植物可移动或交换位置（瓷砖留在原格）</p><div className="tools">
          {(Object.keys(plants) as PlantId[]).map(id => <button key={id} className={tool === id ? "active" : ""} onClick={() => setTool(id)}><i style={{ background: plants[id].color }}>{plants[id].short}</i>{plants[id].name}</button>)}
          <button className={tool === "tile" ? "active" : ""} onClick={() => setTool("tile")}><i className="tile-tool"><Zap /></i>瓷砖</button>
          <button className={tool === "erase" ? "active" : ""} onClick={() => setTool("erase")}><i className="erase"><Eraser /></i>擦除</button>
        </div>{tool === "doom" && <label className="size-pick">毁菇体型 <NativeSelect size="sm" value={doomSize} onChange={e => setDoomSize(e.target.value as DoomSize)}><NativeSelectOption value="small">小</NativeSelectOption><NativeSelectOption value="medium">中</NativeSelectOption><NativeSelectOption value="large">大</NativeSelectOption></NativeSelect></label>}</div>
        <div className="composer"><div><em>MANUAL INPUT</em><h3>追加手动喂豆</h3><p>当前：{selected} · {board[selected] ? plants[board[selected].type].name : "空格"}</p></div><label>发生时间<div><input type="number" min={0} value={feedAt} onChange={e => setFeedAt(Number(e.target.value))} /><b>ms</b></div></label><Button onClick={() => addFeed()} disabled={!board[selected] || !["doom","snake","mandrake","burdock"].includes(board[selected]?.type)}><Play />加入时间轴</Button></div>
        <div className="feed-list">{feeds.map(f => <button key={f.id} onClick={() => setFeeds(old => old.filter(x => x.id !== f.id))} title="点击删除"><b>{ms(f.at)}</b><span>{f.cell} {board[f.cell] ? plants[board[f.cell].type].name : "已移除"}</span><Eraser /></button>)}</div>
      </section>
      <aside className="timeline-panel">
        <div className="heading"><div><em>EVENT TRACE</em><h2>事件时间轴</h2></div><Badge variant="outline">{events.length} 个事件</Badge></div>
        <div className="filters">{(["全部", ...lanes] as const).map(x => <button key={x} className={filter === x ? "active" : ""} onClick={() => setFilter(x)}>{x}</button>)}</div>
        <div className="timeline" aria-live="polite">{shown.map((event, i) => <article className={`event ${event.tone}`} key={`${event.at}-${event.title}-${i}`}><time>{ms(event.at)}</time><i /><div><header><b>{event.title}</b><span>{event.lane}</span></header><p>{event.detail}</p><small className={event.confidence}>{event.confidence === "confirmed" ? "已确认数据" : "估算 · 待逐帧验证"}</small></div></article>)}</div>
      </aside>
    </div>
    <footer><div><FlaskConical /><span><b>当前模型</b>球果 900ms 成阵 / 15s 持续；瓷砖 T=2000+200×欧氏距离。</span></div><div><Sparkles /><span><b>仅加速毁菇与蛇草</b>效果不叠加：飞莲 +90%；铜钱草 +20%；心叶兰 +100%。</span></div><div><Info /><span><b>v0.1 边界</b>牛蒡命中时刻与非 100% 加速动画标为估算。</span></div></footer>
  </main>;
}
