import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { CreatedOrder } from "../types/order";
import { RunTable } from "./RunTable";

interface OrderCardProps {
  order: CreatedOrder;
  controlBusy: boolean;
  onControl: (order: CreatedOrder, action: "pause" | "resume" | "cancel") => void;
  onClone: (order: CreatedOrder) => void;
}

function getRealStatus(order: CreatedOrder): string {
  if (order.status === "cancelled") return "cancelled";
  if (order.status === "failed") return "failed";

  const runs = order.runs || [];
  const now = Date.now();

  if (runs.length > 0) {
    const allFuture = runs.every((run) => {
      const runTime = run?.at instanceof Date ? run.at.getTime() : new Date(run?.at ?? now).getTime();
      return runTime > now;
    });
    if (allFuture && order.status !== "paused") return "scheduled";
  }

  if (runs.length > 0) {
    const allCompleted = runs.every((run) => {
      const runTime = run?.at instanceof Date ? run.at.getTime() : new Date(run?.at ?? now).getTime();
      return runTime <= now;
    });
    if (allCompleted) return "completed";
  }

  if (order.status === "processing") return "running";
  if (order.status === "pending") return "running";

  return order.status;
}

function toShortLink(link: string) {
  if (!link) return "-";
  return link.length > 55 ? `${link.slice(0, 35)}...${link.slice(-15)}` : link;
}

const STATUS_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  running: { bg: "bg-yellow-500/15", text: "text-yellow-300", dot: "bg-yellow-400" },
  processing: { bg: "bg-yellow-500/15", text: "text-yellow-300", dot: "bg-yellow-400" },
  completed: { bg: "bg-emerald-500/15", text: "text-emerald-300", dot: "bg-emerald-400" },
  scheduled: { bg: "bg-amber-500/15", text: "text-amber-300", dot: "bg-amber-400" },
  paused: { bg: "bg-orange-500/15", text: "text-orange-300", dot: "bg-orange-400" },
  cancelled: { bg: "bg-red-500/15", text: "text-red-300", dot: "bg-red-400" },
  pending: { bg: "bg-gray-500/15", text: "text-gray-300", dot: "bg-gray-400" },
  failed: { bg: "bg-red-500/15", text: "text-red-300", dot: "bg-red-400" },
};

export function OrderCard({ order, controlBusy, onControl, onClone }: OrderCardProps) {
  const [showRuns, setShowRuns] = useState(false);
  const status = getRealStatus(order);
  const colors = STATUS_COLORS[status] || STATUS_COLORS.pending;
  const isCancelled = status === "cancelled" || status === "failed";
  const safeRuns = order.runs || [];
  const safeRunStatuses = order.runStatuses || [];
  const safeRunErrors = order.runErrors || [];

  const progress = (() => {
    const total = safeRuns.length;
    if (total === 0) return { percent: 0, completed: 0, total: 0 };
    const now = Date.now();
    const timeCompleted = safeRuns.reduce((count, run) => {
      const runMs = run?.at instanceof Date ? run.at.getTime() : new Date(run?.at ?? now).getTime();
      return runMs <= now ? count + 1 : count;
    }, 0);
    const statusCompleted = safeRunStatuses.filter((s) => s === "completed").length;
    const completed = Math.min(total, Math.max(order.completedRuns || 0, statusCompleted, timeCompleted));
    return { percent: Math.round((completed / total) * 100), completed, total };
  })();

  return (
    <div className={`rounded-xl border bg-gradient-to-br from-gray-900 to-black p-5 ${isCancelled ? "border-red-500/30" : "border-yellow-500/20"}`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h3 className={`text-lg font-semibold ${isCancelled ? "text-red-400" : "text-yellow-400"}`}>
            {order.name || `Mission #${order.id}`}
          </h3>
          <p className="mt-1 text-xs text-gray-600 font-mono">{order.id}</p>
          {order.schedulerOrderId && (
            <p className="text-[9px] text-gray-700 font-mono">Scheduler: {order.schedulerOrderId}</p>
          )}
        </div>
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${colors.bg} ${colors.text}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${colors.dot} ${status === "running" ? "animate-pulse" : ""}`} />
          {status.charAt(0).toUpperCase() + status.slice(1)}
        </span>
      </div>

      {/* Link */}
      <div className="mt-3">
        <a href={order.link} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-400 hover:text-blue-300 hover:underline">
          {toShortLink(order.link)}
        </a>
      </div>

      {/* Error */}
      {order.errorMessage && (
        <div className="mt-2 rounded-md bg-red-500/10 border border-red-500/20 px-3 py-2">
          <p className="text-xs text-red-400">❌ {order.errorMessage}</p>
        </div>
      )}

      {/* Progress */}
      <div className="mt-4">
        <div className="flex items-center justify-between text-xs mb-1.5">
          <span className="text-gray-500">Progress</span>
          <span className="text-gray-400">{progress.completed}/{progress.total} runs ({progress.percent}%)</span>
        </div>
        <div className="w-full overflow-hidden rounded-full bg-gray-800 h-2">
          <div
            className={`h-2 rounded-full transition-all duration-500 ${
              progress.percent === 100 ? "bg-emerald-500" : progress.percent > 50 ? "bg-yellow-500" : "bg-yellow-600"
            }`}
            style={{ width: `${progress.percent}%` }}
          />
        </div>
      </div>

      {/* Stats */}
      <div className="mt-4 grid grid-cols-5 gap-2">
        <div className="rounded-md bg-black/50 border border-gray-800 px-2 py-2 text-center">
          <p className="text-sm font-medium text-yellow-400">{(order.totalViews / 1000).toFixed(0)}k</p>
          <p className="text-[9px] text-gray-600">Views</p>
        </div>
        <div className="rounded-md bg-black/50 border border-gray-800 px-2 py-2 text-center">
          <p className="text-sm font-medium text-pink-400">{order.engagement.likes}</p>
          <p className="text-[9px] text-gray-600">Likes</p>
        </div>
        <div className="rounded-md bg-black/50 border border-gray-800 px-2 py-2 text-center">
          <p className="text-sm font-medium text-blue-400">{order.engagement.shares}</p>
          <p className="text-[9px] text-gray-600">Shares</p>
        </div>
        <div className="rounded-md bg-black/50 border border-gray-800 px-2 py-2 text-center">
          <p className="text-sm font-medium text-purple-400">{order.engagement.saves}</p>
          <p className="text-[9px] text-gray-600">Saves</p>
        </div>
        <div className="rounded-md bg-black/50 border border-gray-800 px-2 py-2 text-center">
          <p className="text-sm font-medium text-pink-400">{order.engagement.comments || 0}</p>
          <p className="text-[9px] text-gray-600">Comments</p>
        </div>
      </div>

      {/* Info Row */}
      <div className="mt-3 grid grid-cols-3 gap-2 text-[10px] text-gray-600">
        <div>
          <span className="text-gray-500">API:</span> {order.selectedAPI || "N/A"}
        </div>
        <div>
          <span className="text-gray-500">Bundle:</span> {order.selectedBundle || "N/A"}
        </div>
        <div>
          <span className="text-gray-500">Pattern:</span> {order.patternName || order.patternType}
        </div>
      </div>

      {/* Controls */}
      <div className="mt-4 flex items-center gap-2 flex-wrap">
        {!isCancelled && status === "running" && (
          <button
            onClick={() => onControl(order, "pause")}
            disabled={controlBusy}
            className="flex items-center gap-1 rounded-md border border-orange-500/30 bg-orange-500/10 px-3 py-1.5 text-xs font-medium text-orange-300 hover:bg-orange-500/20 transition disabled:opacity-50"
          >
            {controlBusy ? "⏳" : "⏸️"} Pause
          </button>
        )}

        {!isCancelled && status === "paused" && (
          <button
            onClick={() => onControl(order, "resume")}
            disabled={controlBusy}
            className="flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-300 hover:bg-emerald-500/20 transition disabled:opacity-50"
          >
            {controlBusy ? "⏳" : "▶️"} Resume
          </button>
        )}

        {!isCancelled && status !== "completed" && (
          <button
            onClick={() => {
              if (window.confirm("Cancel this mission?")) {
                onControl(order, "cancel");
              }
            }}
            disabled={controlBusy}
            className="flex items-center gap-1 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-300 hover:bg-red-500/20 transition disabled:opacity-50"
          >
            {controlBusy ? "⏳" : "❌"} Cancel
          </button>
        )}

        <button
          onClick={() => onClone(order)}
          className="flex items-center gap-1 rounded-md border border-gray-600 bg-black px-3 py-1.5 text-xs font-medium text-gray-400 hover:text-white hover:border-gray-500 transition"
        >
          📋 Clone
        </button>

        <a
          href={order.link}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 rounded-md border border-gray-600 bg-black px-3 py-1.5 text-xs font-medium text-gray-400 hover:text-white hover:border-gray-500 transition"
        >
          🔗 Open
        </a>

        <button
          onClick={() => setShowRuns(!showRuns)}
          className={`flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs font-medium transition ml-auto ${
            showRuns
              ? "border-yellow-500/50 bg-yellow-500/20 text-yellow-300"
              : "border-yellow-500/30 bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20"
          }`}
        >
          {showRuns ? "🔼 Hide Runs" : `📋 View Runs (${safeRuns.length})`}
        </button>
      </div>

      {/* Run Table */}
      <AnimatePresence>
        {showRuns && safeRuns.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-4 overflow-hidden"
          >
            <div className="rounded-lg border border-yellow-500/20 bg-black/50 p-3">
              <RunTable
                runs={safeRuns}
                runStatuses={safeRunStatuses}
                runErrors={safeRunErrors}
                runRetries={order.runRetries || []}
                runOriginalTimes={order.runOriginalTimes || []}
                runCurrentTimes={order.runCurrentTimes || []}
                runReasons={order.runReasons || []}
                mode="logs"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Timestamps */}
      <div className="mt-3 flex items-center justify-between text-[10px] text-gray-700">
        <span>Created: {new Date(order.createdAt).toLocaleString()}</span>
        {order.lastUpdatedAt && (
          <span>Updated: {new Date(order.lastUpdatedAt).toLocaleString()}</span>
        )}
      </div>
    </div>
  );
}
